---
name: wiki-compiler
description: API-based knowledge compilation agent. Reads workspace files via the llmwiki API, compiles them into topic-based wiki articles, and outputs via the same API. Triggered by the agent compile pipeline.
---

# Wiki Compiler — Compilation Algorithm

This skill defines the algorithm for compiling source markdown files into a topic-based wiki knowledge base.

## Architecture

This agent runs inside the llmwiki backend. It accesses files through the backend service layer (not file system). The pipeline:

1. **Read source files** from the workspace via the file tree + content API
2. **Process** through LLM with this skill as instruction context
3. **Output** compiled articles as JSON via the pipeline
4. **Write** files to the workspace via API (`CreateTextFile`, `CreateFolder`)
5. **Commit** the version snapshot via API (`CreateCommit`)

## Phase 1: Understand Source Files

The source files are provided in the prompt as a list with their full content. Each file has:
- `path`: relative path within the workspace (e.g., `docs/architecture.md`)
- `name`: file name (e.g., `architecture.md`)
- `content`: full markdown content of the file

### Rules
- All source files are read-only. Do not modify source content.
- Source files are markdown (.md) format.
- Filter out non-essential files (node_modules, binaries, etc.) — focus on documentation and knowledge content.

## Phase 2: Classify and Discover Topics

For each source file, analyze:
1. File path (directory structure is a strong signal)
2. Title (first `#` heading)
3. Content themes and key terms
4. Other files referencing the same concepts

### Topic Discovery
- Group related files into topics based on shared themes and directory structure.
- Topic slugs should be lowercase-kebab-case (e.g., `architecture-design`, `deployment-guide`).
- A single file can belong to MULTIPLE topics if it covers multiple subjects.
- If 3+ unclassified files share a theme, create a new topic.
- Prefer consolidating related content rather than creating too many topics.

### Topic Classification
Classify each topic as:
- **Time-sensitive** (default): topics about fast-moving domains — AI tools, UI patterns, workflows, external services. Claims older than 6 months are "aging", older than 18 months are "stale".
- **Stable**: foundational concepts, architecture decisions, personal knowledge. Claims older than 24 months are "aging", older than 48 months are "stale".

## Phase 3: Compile Topic Articles

For each topic, compile a comprehensive article. Write to the output directory.

### Article Structure

```markdown
# {Topic Title}

## Summary
Standalone briefing of the topic. Someone reading just this section should understand the current state. Include the date range of source materials.

## Content
Detailed synthesis organized by subtopics. Each section must include:
- **Coverage tag**: `[coverage: high/medium/low]` indicating how many sources contributed
  - `high`: 5+ sources, detailed synthesis
  - `medium`: 2-4 sources, may miss detail
  - `low`: 0-1 sources, reader should check raw sources
- **Date annotations**: For time-sensitive topics, prefix key claims with `[YYYY-MM]` or mark stale content with `⚠️ [YYYY-MM, may be stale]`

## Sources
List all source files organized by their paths. Use markdown link format.
```

### Coverage Rules
- Each section heading must include a coverage tag.
- Calculate coverage per section, not per article.
- Time-sensitive topics: lead Summary with date range of sources.
- Do NOT delete stale content — flag it with date annotations. Old entries have historical value.

## Phase 4: Generate INDEX.md

Create an INDEX.md in the output directory:

```markdown
# {Project Name} Knowledge Base

Last compiled: {current date}
Total topics: {count}

## Topics

| Topic | Sources | Status |
|-------|---------|--------|
| [{slug}]({slug}.md) | {count} | active |

## Recent Changes
- {date}: Initial compilation from {N} source files
```

## Phase 5: Log

Create a log entry appended to `log.md`:

```markdown
## {current date}

**Topics created:** {list}
**Sources processed:** {count}
```

## Output Format

The compilation result must be a JSON array of output files:

```json
{
  "files": [
    {
      "path": "architecture.md",
      "content": "# Architecture\n\n..."
    },
    {
      "path": "INDEX.md",
      "content": "# Knowledge Base\n\n..."
    },
    {
      "path": "log.md",
      "content": "## 2026-06-03\n\n..."
    }
  ]
}
```

- Each `path` is relative to the output directory.
- `content` is the complete markdown content.
- Always include INDEX.md and log.md in the output.
- Files will be created via the backend API (`CreateTextFile`) and committed automatically.
