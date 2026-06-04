package agent

import (
	"fmt"
	"strings"
	"time"
)

// ========== Domain Detection & Grouping ==========

// DomainGroup represents a single domain with its files and metadata.
type DomainGroup struct {
	Name      string
	Files     []FileNode
	Readme    string // content of domains/{name}/README.md if exists
}

// groupFilesByDomain partitions files by domains/{domain}/ prefix.
// If no files are under a domains/ folder, returns a single "wiki" group.
func groupFilesByDomain(files []FileNode) []DomainGroup {
	// Check if any file path starts with "domains/"
	if !hasDomainFolder(files) {
		// No domains structure: single wiki domain with all files
		return []DomainGroup{{Name: "wiki", Files: files}}
	}

	// Group by domains/{name}/
	groups := make(map[string][]FileNode)
	var metaFiles []FileNode   // everything outside domains/
	var noDomain []FileNode    // files in domains/ but not in a subfolder

	for _, f := range files {
		if !strings.HasPrefix(f.Path, "domains/") {
			metaFiles = append(metaFiles, f)
			continue
		}
		rel := strings.TrimPrefix(f.Path, "domains/")
		parts := strings.SplitN(rel, "/", 2)
		if len(parts) < 2 {
			noDomain = append(noDomain, f)
			continue
		}
		domainName := parts[0]
		// Skip domains/skills — handled separately
		if domainName == "skills" {
			continue
		}
		groups[domainName] = append(groups[domainName], f)
	}

	result := make([]DomainGroup, 0, len(groups))
	for name, gf := range groups {
		// Extract README content from the group files
		readme := extractReadme(gf)
		result = append(result, DomainGroup{
			Name:   name,
			Files:  gf,
			Readme: readme,
		})
	}

	// Attach meta files (sources/, meta/) to wiki domain for context
	if len(metaFiles) > 0 || len(noDomain) > 0 {
		found := false
		for i := range result {
			if result[i].Name == "wiki" {
				result[i].Files = append(result[i].Files, metaFiles...)
				result[i].Files = append(result[i].Files, noDomain...)
				found = true
				break
			}
		}
		if !found && len(metaFiles) > 0 {
			result = append(result, DomainGroup{
				Name:  "wiki",
				Files: append(metaFiles, noDomain...),
			})
		}
	}

	return result
}

// hasDomainFolder checks if any file path starts with "domains/".
func hasDomainFolder(files []FileNode) bool {
	for _, f := range files {
		if strings.HasPrefix(f.Path, "domains/") {
			return true
		}
	}
	return false
}

// extractReadme searches for a README.md in the file list and returns its content.
func extractReadme(files []FileNode) string {
	for _, f := range files {
		if strings.HasSuffix(f.Name, "README.md") || strings.HasSuffix(f.Path, "README.md") {
			return f.Content
		}
	}
	return ""
}

// ========== ECL Output Format Helpers ==========

// addFrontMatter prepends ECL-compatible front-matter to article content.
func addFrontMatter(content, domain string) string {
	today := time.Now().Format("2006-01-02")
	fm := fmt.Sprintf("---\nlast_verified: %s\nconfidence: medium\nagent: llmwiki-compiler\ndomain: %s\n---\n\n", today, domain)
	if strings.HasPrefix(strings.TrimSpace(content), "---") {
		// Already has front-matter, don't duplicate
		return content
	}
	return fm + content
}

// generateDomainIndex creates INDEX.md for the entire ECL output.
func generateDomainIndex(domains []DomainGroup, allOutputs []OutputFile) OutputFile {
	today := time.Now().Format("2006-01-02")
	var b strings.Builder
	b.WriteString("# Knowledge Base\n\n")
	b.WriteString(fmt.Sprintf("最后编译: %s\n", today))
	b.WriteString(fmt.Sprintf("领域数: %d\n\n", len(domains)))

	for _, d := range domains {
		b.WriteString(fmt.Sprintf("## %s\n\n", d.Name))
		count := 0
		for _, o := range allOutputs {
			if strings.HasPrefix(o.Path, "domains/"+d.Name+"/") {
				count++
			} else if d.Name == "wiki" && !strings.Contains(o.Path, "domains/") {
				count++
			}
		}
		b.WriteString(fmt.Sprintf("- 文章数: %d\n", count))
		if d.Readme != "" {
			b.WriteString(fmt.Sprintf("- 概述: %s\n", truncate(d.Readme, 200)))
		}
		b.WriteString("\n")
	}

	b.WriteString("## 最近变更\n")
	b.WriteString(fmt.Sprintf("- %s: 知识编译\n", today))
	return OutputFile{Path: "INDEX.md", Content: b.String()}
}

// generateMappingNote creates/updates a domain's mapping-notes.md entry.
func generateMappingNote(domain string, topics []TopicInfo, fileCount int) OutputFile {
	today := time.Now().Format("2006-01-02")
	var names []string
	for _, t := range topics {
		names = append(names, t.Name)
	}
	content := fmt.Sprintf("## %s\n\n**编译的主题:** %s\n**处理的源文件:** %d\n**Agent:** llmwiki-compiler\n\n",
		today, strings.Join(names, ", "), fileCount)
	return OutputFile{Path: fmt.Sprintf("domains/%s/mapping-notes.md", domain), Content: content + "\n"}
}

// outputPathForDomain returns the correct output path for a topic in a domain.
func outputPathForDomain(domain, topicName string) string {
	if domain == "wiki" {
		return topicName + ".md"
	}
	return fmt.Sprintf("domains/%s/%s.md", domain, topicName)
}
