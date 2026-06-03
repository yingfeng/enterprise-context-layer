package handler

import (
	"fmt"
	"io"
	"llmwiki/backend/agent"
	"time"

	"github.com/gin-gonic/gin"
)

// CompileHandler provides the compilation API endpoints.
type CompileHandler struct {
	compiler *agent.Compiler
}

func NewCompileHandler(compiler *agent.Compiler) *CompileHandler {
	return &CompileHandler{compiler: compiler}
}

// StartCompile POST /api/v1/agent/compile — starts async compilation
func (h *CompileHandler) StartCompile(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	actor := c.GetString("user_id")

	var req struct {
		WorkspaceID  string   `json:"workspace_id"`
		Instructions string   `json:"instructions"`
		SkillRefs    []string `json:"skill_refs"`
		OutputDir    string   `json:"output_dir"`
		CommitMsg    string   `json:"commit_message"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		ginAbort(c, 400, "bad request: "+err.Error())
		return
	}
	if req.WorkspaceID == "" {
		ginAbort(c, 400, "workspace_id required")
		return
	}

	input := &agent.CompileInput{
		WorkspaceID:  req.WorkspaceID,
		TenantID:     tenantID,
		Actor:        actor,
		Instructions: req.Instructions,
		SkillRefs:    req.SkillRefs,
		OutputDir:    req.OutputDir,
		CommitMsg:    req.CommitMsg,
	}

	task, err := h.compiler.StartCompile(c.Request.Context(), input)
	if err != nil {
		ginAbort(c, 500, "start compile: "+err.Error())
		return
	}

	ginJSON(c, gin.H{"data": gin.H{
		"task_id": task.ID,
		"status":  task.GetStatus(),
	}})
}

// GetTask GET /api/v1/agent/compile/:id — get task status and log
func (h *CompileHandler) GetTask(c *gin.Context) {
	taskID := c.Param("id")
	task := h.compiler.GetTask(taskID)
	if task == nil {
		ginAbort(c, 404, "task not found")
		return
	}

	ginJSON(c, gin.H{"data": gin.H{
		"id":          task.ID,
		"status":      task.GetStatus(),
		"log":         task.GetLog(),
		"created_at":  task.CreatedAt,
		"started_at":  task.StartedAt,
		"finished_at": task.FinishedAt,
		"result":      task.Result,
		"error":       task.Error,
	}})
}

// StreamLogs GET /api/v1/agent/compile/:id/logs?tail=1 — SSE log streaming
func (h *CompileHandler) StreamLogs(c *gin.Context) {
	taskID := c.Param("id")
	task := h.compiler.GetTask(taskID)
	if task == nil {
		ginAbort(c, 404, "task not found")
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(gin.ResponseWriter)
	if !ok {
		ginAbort(c, 500, "streaming not supported")
		return
	}

	lastLog := ""
	clientGone := c.Request.Context().Done()

	for {
		select {
		case <-clientGone:
			return
		default:
		}

		currentLog := task.GetLog()
		if currentLog != lastLog {
			newContent := currentLog[len(lastLog):]
			if newContent != "" {
				fmt.Fprintf(c.Writer, "data: %s\n\n", escapeSSE(newContent))
				flusher.Flush()
			}
			lastLog = currentLog
		}

		status := task.GetStatus()
		if status == "success" || status == "failed" {
			fmt.Fprintf(c.Writer, "event: done\ndata: {\"status\":\"%s\"}\n\n", status)
			flusher.Flush()
			return
		}

		time.Sleep(500 * time.Millisecond)
	}
}

// ListTasks GET /api/v1/agent/compile — list all compile tasks
func (h *CompileHandler) ListTasks(c *gin.Context) {
	tasks := h.compiler.ListTasks()
	type taskSummary struct {
		ID         string    `json:"id"`
		Status     string    `json:"status"`
		CreatedAt  time.Time `json:"created_at"`
		LogPreview string    `json:"log_preview"`
	}
	var result []taskSummary
	for _, t := range tasks {
		log := t.GetLog()
		preview := ""
		if len(log) > 200 {
			preview = log[:200]
		} else {
			preview = log
		}
		result = append(result, taskSummary{
			ID:         t.ID,
			Status:     t.GetStatus(),
			CreatedAt:  t.CreatedAt,
			LogPreview: preview,
		})
	}
	ginJSON(c, gin.H{"data": result})
}

func escapeSSE(s string) string {
	// Basic escaping for SSE data
	var out []byte
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			out = append(out, '\n')
		} else {
			out = append(out, s[i])
		}
	}
	return string(out)
}

// Ensure io is used (for future streaming)
var _ = io.Discard
