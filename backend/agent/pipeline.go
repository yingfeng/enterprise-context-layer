package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"llmwiki/backend/entity"
	"llmwiki/backend/service"
)

// CompileInput is the input to the compilation pipeline.
type CompileInput struct {
	WorkspaceID  string
	TenantID     string
	Actor        string
	Instructions string
	SkillRefs    []string
	OutputDir    string
	CommitMsg    string
}

// CompileResult is the output of the compilation pipeline.
type CompileResult struct {
	TaskID       string
	CommitID     string
	FilesCreated int
	ErrorMessage string
}

// OutputFile represents a single output file to create.
type OutputFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// LLMResult contains the structured output from the LLM.
type LLMResult struct {
	Files []OutputFile `json:"files"`
}

// FileNode represents a file in the workspace tree.
type FileNode struct {
	ID      string
	Name    string
	Path    string
	Content string
}

// SkillDef represents a loaded skill definition.
type SkillDef struct {
	Name    string
	Content string
}

// TaskState tracks a running/tracked compilation task.
type TaskState struct {
	ID        string
	Status    string // "pending", "running", "success", "failed"
	CreatedAt time.Time
	StartedAt time.Time
	FinishedAt time.Time
	Log       string
	Result    *CompileResult
	Error     string
	mu        sync.RWMutex
}

func (t *TaskState) AppendLog(format string, args ...interface{}) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Log += fmt.Sprintf(format, args...)
}

func (t *TaskState) SetStatus(s string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Status = s
}

func (t *TaskState) GetStatus() string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.Status
}

func (t *TaskState) GetLog() string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.Log
}

// Compiler is the knowledge compilation agent.
type Compiler struct {
	fileSvc    *service.FileService
	llm        *LLMClient
	tasks      map[string]*TaskState
	tasksMu    sync.RWMutex
	entityID   func() string
}

// NewCompiler creates a new Compiler instance.
func NewCompiler(fileSvc *service.FileService, llm *LLMClient) *Compiler {
	return &Compiler{
		fileSvc:  fileSvc,
		llm:      llm,
		tasks:    make(map[string]*TaskState),
		entityID: entity.NewID,
	}
}

// StartCompile creates a compilation task and starts it in background.
func (c *Compiler) StartCompile(ctx context.Context, input *CompileInput) (*TaskState, error) {
	taskID := c.entityID()
	task := &TaskState{
		ID:        taskID,
		Status:    "pending",
		CreatedAt: time.Now(),
	}
	c.tasksMu.Lock()
	c.tasks[taskID] = task
	c.tasksMu.Unlock()

	go c.runCompile(task, input)
	return task, nil
}

// GetTask returns the task state by ID.
func (c *Compiler) GetTask(taskID string) *TaskState {
	c.tasksMu.RLock()
	defer c.tasksMu.RUnlock()
	return c.tasks[taskID]
}

// ListTasks returns all tracked tasks.
func (c *Compiler) ListTasks() []*TaskState {
	c.tasksMu.RLock()
	defer c.tasksMu.RUnlock()
	result := make([]*TaskState, 0, len(c.tasks))
	for _, t := range c.tasks {
		result = append(result, t)
	}
	return result
}

// runCompile executes the full compilation pipeline with logging.
func (c *Compiler) runCompile(task *TaskState, input *CompileInput) {
	task.SetStatus("running")
	task.StartedAt = time.Now()
	task.AppendLog("[TASK] ===== Compilation Started =====\n")
	task.AppendLog("[TASK] Workspace: %s\n", input.WorkspaceID)
	task.AppendLog("[TASK] Output: %s\n", input.OutputDir)
	task.AppendLog("[TASK] Skills: %v\n", input.SkillRefs)
	task.AppendLog("[TASK] Instructions: %s\n\n", input.Instructions)

	c.llm.SetLogCallback(func(format string, args ...interface{}) {
		task.AppendLog(format, args...)
	})

	// Phase 1: Load workspace files
	task.AppendLog("[PHASE 1] Loading workspace files...\n")
	files, err := c.loadWorkspaceFiles(input.WorkspaceID)
	if err != nil {
		task.AppendLog("[ERROR] Load workspace files: %v\n", err)
		task.Error = err.Error()
		task.SetStatus("failed")
		task.FinishedAt = time.Now()
		return
	}
	task.AppendLog("[PHASE 1] Loaded %d files\n\n", len(files))

	// Phase 2: Load skills — auto-discover from .knowledgebase/skills/ if not explicitly specified
	task.AppendLog("[PHASE 2] Loading skills...\n")
	skills, err := c.loadSkills(input.WorkspaceID, input.SkillRefs)
	if err != nil {
		task.AppendLog("[WARN] Load skills: %v\n", err)
	}
	task.AppendLog("[PHASE 2] Loaded %d skills\n\n", len(skills))

	// Phase 3: Build prompt and call LLM
	outputDir := input.OutputDir
	if outputDir == "" {
		outputDir = "synthesis"
	}

	prompt := c.buildPrompt(files, skills, input.Instructions, outputDir)
	task.AppendLog("[PHASE 3] Prompt built (%d chars total)\n", len(prompt))
	task.AppendLog("[PHASE 3] Calling LLM (%s)...\n", c.llm.model)

	// System prompt embeds the compilation algorithm.
	// If skills were loaded, they take precedence (the user's custom skill overrides).
	// Otherwise, use the default wiki-compiler algorithm.
	systemPrompt := c.buildSystemPrompt(skills, outputDir)

	ctx := context.Background()
	result, err := c.llm.Chat(ctx, systemPrompt, prompt, nil)
	if err != nil {
		task.AppendLog("[PHASE 3] LLM call failed: %v\n", err)
		task.Error = err.Error()
		task.SetStatus("failed")
		task.FinishedAt = time.Now()
		return
	}
	task.AppendLog("[PHASE 3] LLM returned %d files\n\n", len(result.Files))

	// Phase 4: Write output files to separate workspace
	task.AppendLog("[PHASE 4] Writing output files...\n")
	created, outputWkspID, err := c.writeOutputFiles(task, input, outputDir, result.Files)
	if err != nil {
		task.AppendLog("[PHASE 4] Error: %v\n", err)
		task.Error = err.Error()
		task.SetStatus("failed")
		task.FinishedAt = time.Now()
		return
	}
	task.AppendLog("[PHASE 4] Created %d files\n\n", len(created))

	// Phase 5: Commit — commit the OUTPUT workspace, not the source
	task.AppendLog("[PHASE 5] Creating commit...\n")
	commitID, err := c.commit(input, outputWkspID)
	if err != nil {
		task.AppendLog("[PHASE 5] Commit warning: %v\n", err)
	} else {
		task.AppendLog("[PHASE 5] Commit ID: %s\n", commitID)
	}

	task.AppendLog("[TASK] ===== Compilation Complete =====\n")
	task.Result = &CompileResult{
		FilesCreated: len(created),
		CommitID:     commitID,
	}
	task.SetStatus("success")
	task.FinishedAt = time.Now()
}

// loadWorkspaceFiles loads all markdown files from the workspace.
func (c *Compiler) loadWorkspaceFiles(workspaceID string) ([]FileNode, error) {
	tree, err := c.fileSvc.GetCurrentTree(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("get tree: %w", err)
	}
	if tree == nil {
		return nil, fmt.Errorf("workspace not found")
	}

	var nodes []FileNode
	walkTree(tree, "", &nodes, c.fileSvc, workspaceID)
	return nodes, nil
}

func walkTree(node *entity.TreeNode, parentPath string, nodes *[]FileNode, svc *service.FileService, workspaceID string) {
	for i := range node.Children {
		child := node.Children[i]
		relPath := child.Name
		if parentPath != "" {
			relPath = parentPath + "/" + child.Name
		}

		if child.Type == "folder" {
			walkTree(&child, relPath, nodes, svc, workspaceID)
		} else {
			var content string
			if child.Location != nil && *child.Location != "" {
				data, err := svc.GetStorageData(workspaceID, *child.Location)
				if err == nil {
					content = string(data)
				}
			}
			if content == "" {
				content = "[empty or unreadable]"
			}
			*nodes = append(*nodes, FileNode{
				ID:      child.ID,
				Name:    child.Name,
				Path:    relPath,
				Content: content,
			})
		}
	}
}

// loadSkills loads skill files — first from the workspace's skills folder,
// then falls back to the local filesystem skills/ directory.
func (c *Compiler) loadSkills(workspaceID string, skillRefs []string) ([]SkillDef, error) {
	// Try workspace first
	tree, err := c.fileSvc.GetCurrentTree(workspaceID)
	if err == nil && tree != nil {
		skillsFolderID := findFolderNamed(tree, ".knowledgebase")
		if skillsFolderID == "" {
			skillsFolderID = findFolderNamed(tree, "skills")
		}
		if skillsFolderID != "" {
			skillsTree, err := c.fileSvc.GetCurrentTree(skillsFolderID)
			if err == nil && skillsTree != nil {
				var skills []SkillDef
				if len(skillRefs) > 0 {
					for _, ref := range skillRefs {
						for _, child := range skillsTree.Children {
							if child.Type == "file" && child.Name == ref && child.Location != nil && *child.Location != "" {
								data, err := c.fileSvc.GetStorageData(workspaceID, *child.Location)
								if err != nil {
									continue
								}
								skills = append(skills, SkillDef{Name: ref, Content: string(data)})
							}
						}
					}
				} else {
					for _, child := range skillsTree.Children {
						if child.Type == "file" && child.Location != nil && *child.Location != "" {
							data, err := c.fileSvc.GetStorageData(workspaceID, *child.Location)
							if err != nil {
								continue
							}
							skills = append(skills, SkillDef{Name: child.Name, Content: string(data)})
						}
					}
				}
				if len(skills) > 0 {
					return skills, nil
				}
			}
		}
	}

	// Fallback: load from local filesystem skills/ directory
	return loadLocalSkills()
}

// loadLocalSkills reads skill files from skills/ directory next to the backend.
func loadLocalSkills() ([]SkillDef, error) {
	// Try multiple possible locations for the skills directory
	candidates := []string{
		"skills",
		"../skills",
		filepath.Join("skills", "wiki-compiler"),
		filepath.Join("..", "skills", "wiki-compiler"),
	}

	for _, dir := range candidates {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		var skills []SkillDef
		for _, e := range entries {
			if e.IsDir() || filepath.Ext(e.Name()) == ".md" {
				data, err := os.ReadFile(filepath.Join(dir, e.Name()))
				if err != nil {
					continue
				}
				skills = append(skills, SkillDef{Name: e.Name(), Content: string(data)})
			}
		}
		if len(skills) > 0 {
			return skills, nil
		}
	}
	return nil, nil
}

func findFolderNamed(node *entity.TreeNode, name string) string {
	for _, child := range node.Children {
		if child.Type == "folder" && child.Name == name {
			return child.ID
		}
		if child.Type == "folder" {
			if id := findFolderNamed(&child, name); id != "" {
				return id
			}
		}
	}
	return ""
}

// buildPrompt constructs the full compilation prompt.
func (c *Compiler) buildPrompt(files []FileNode, skills []SkillDef, instructions, outputDir string) string {
	var b strings.Builder

	if len(skills) > 0 {
		b.WriteString("## 技能规范\n\n")
		for _, s := range skills {
			b.WriteString(fmt.Sprintf("### %s\n%s\n\n", s.Name, s.Content))
		}
	}

	b.WriteString(fmt.Sprintf("\n## 源文件（共 %d 个）\n\n", len(files)))
	for _, f := range files {
		b.WriteString(fmt.Sprintf("### %s\n```\n%s\n```\n\n", f.Path, f.Content))
	}

	b.WriteString(fmt.Sprintf("\n## 用户指令\n\n%s\n", instructions))
	b.WriteString(fmt.Sprintf("\n输出目录: %s\n", outputDir))

	return b.String()
}

// buildSystemPrompt builds the system prompt for the LLM.
// All algorithm details come from the loaded skill files (SKILL.md), not from here.
func (c *Compiler) buildSystemPrompt(skills []SkillDef, outputDir string) string {
	return `你是一个知识编译专家。下面的 skill 规范定义了完整的编译算法，请严格遵循。

输出纯 JSON 格式。JSON 格式:
{"files": [{"path": "article-name.md", "content": "# Title\n\ncontent..."}]}

重要: path 只包含文件名（如 "architecture.md"），不要包含目录前缀。
`
}

// writeOutputFiles creates output files in a SEPARATE workspace at the root level.
// Instead of putting synthesis/ inside the source workspace, it creates
// "{source-workspace-name}-{outputDir}" as a sibling workspace under root.
func (c *Compiler) writeOutputFiles(task *TaskState, input *CompileInput, outputDir string, files []OutputFile) ([]string, string, error) {
	// Get source workspace info and root folder
	srcWorkspace, err := c.fileSvc.GetFileByID(input.WorkspaceID)
	if err != nil {
		return nil, "", fmt.Errorf("get source workspace: %w", err)
	}
	rootFolder, err := c.fileSvc.GetOrCreateRootFolder(input.TenantID, input.Actor)
	if err != nil {
		return nil, "", fmt.Errorf("get root folder: %w", err)
	}

	// Create output workspace name: "{source-name}-{outputDir}"
	outputName := srcWorkspace.Name + "-" + outputDir

	// Create the output workspace as a root-level folder
	outputWS, err := c.fileSvc.CreateFolder(input.TenantID, rootFolder.ID, outputName, input.Actor)
	if err != nil {
		task.AppendLog("[PHASE 4] Creating folder '%s' failed (may already exist): %v\n", outputName, err)
		// If it already exists, we need to find it by name under root
		rootTree, _ := c.fileSvc.GetCurrentTree(rootFolder.ID)
		outputWS = findChildFolderByName(rootTree, outputName)
	}
	if outputWS != nil {
		task.AppendLog("[PHASE 4] Output workspace: '%s' (id=%s)\n", outputName, outputWS.ID)
	} else {
		return nil, "", fmt.Errorf("cannot create or find output workspace '%s'", outputName)
	}

	var created []string
	for _, f := range files {
		// Strip any outputDir prefix from the path (safety measure)
		name := strings.TrimPrefix(f.Path, outputDir+"/")
		name = strings.TrimPrefix(name, outputDir+"\\")
		if name == "" {
			name = f.Path
		}

		task.AppendLog("[PHASE 4] Creating file: %s in workspace '%s'\n", name, outputName)
		fileRec, err := c.fileSvc.CreateTextFile(input.TenantID, outputWS.ID, name, f.Content, input.Actor)
		if err != nil {
			task.AppendLog("[PHASE 4] Warning: failed to create '%s': %v\n", name, err)
			continue
		}
		created = append(created, fileRec.ID)
	}
	return created, outputWS.ID, nil
}

// commit creates a versioned commit for the output workspace.
func (c *Compiler) commit(input *CompileInput, outputWorkspaceID string) (string, error) {
	msg := input.CommitMsg
	if msg == "" {
		msg = "Agent knowledge compilation"
	}

	commit, err := c.fileSvc.CreateCommit(outputWorkspaceID, input.Actor, msg, nil)
	if err != nil {
		return "", err
	}
	return commit.ID, nil
}

// findChildFolderByName looks for a folder child by name in a tree node.
func findChildFolderByName(node *entity.TreeNode, name string) *entity.File {
	for _, child := range node.Children {
		if child.Type == "folder" && child.Name == name {
			return &entity.File{ID: child.ID, Name: child.Name, ParentID: child.ID}
		}
	}
	return nil
}
