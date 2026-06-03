package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

const (
	cpPrefix     = "llmwiki:cp:"
	cpTTL        = 24 * time.Hour
)

// Checkpoint stores compilation state for resume support.
type Checkpoint struct {
	TaskID     string        `json:"task_id"`
	Phase      string        `json:"phase"`       // "scan","compile","concept","index","write"
	Topics     []TopicInfo   `json:"topics,omitempty"`
	Compiled   []OutputFile  `json:"compiled,omitempty"`
	AllOutputs []OutputFile  `json:"all_outputs,omitempty"`
	FileCount  int           `json:"file_count"`
	OutputDir  string        `json:"output_dir"`
}

// CheckpointManager handles save/load/resume via Redis.
type CheckpointManager struct {
	rdb    *redis.Client
	taskID string
}

func NewCheckpointManager(rdb *redis.Client, taskID string) *CheckpointManager {
	return &CheckpointManager{rdb: rdb, taskID: taskID}
}

func cpKey(taskID string) string { return cpPrefix + taskID }

func (m *CheckpointManager) key() string { return cpKey(m.taskID) }

// Save persists checkpoint to Redis with TTL.
func (m *CheckpointManager) Save(cp *Checkpoint) error {
	cp.TaskID = m.taskID
	data, err := json.Marshal(cp)
	if err != nil {
		return fmt.Errorf("marshal checkpoint: %w", err)
	}
	return m.rdb.Set(context.Background(), m.key(), data, cpTTL).Err()
}

// Load retrieves a previous checkpoint, returns nil if none.
func (m *CheckpointManager) Load() (*Checkpoint, error) {
	data, err := m.rdb.Get(context.Background(), m.key()).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("redis get: %w", err)
	}
	var cp Checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		return nil, fmt.Errorf("unmarshal checkpoint: %w", err)
	}
	return &cp, nil
}

// Delete removes checkpoint after successful completion.
func (m *CheckpointManager) Delete() {
	m.rdb.Del(context.Background(), m.key())
}

// SavePhase is a convenience for saving a single phase checkpoint.
func (m *CheckpointManager) SavePhase(phase string, topics []TopicInfo, compiled, allOutputs []OutputFile, fileCount int, outputDir string) error {
	return m.Save(&Checkpoint{
		Phase:      phase,
		Topics:     topics,
		Compiled:   compiled,
		AllOutputs: allOutputs,
		FileCount:  fileCount,
		OutputDir:  outputDir,
	})
}
