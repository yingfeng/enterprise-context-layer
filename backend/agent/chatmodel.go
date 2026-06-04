package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/cloudwego/eino/schema"
	openai "github.com/sashabaranov/go-openai"

	"github.com/cloudwego/eino/components/model"
)

// DeepSeekChatModel wraps LLMClient as a BaseChatModel + ToolCallingChatModel.
type DeepSeekChatModel struct {
	client *LLMClient
	tools  []*schema.ToolInfo
}

func NewDeepSeekChatModel(llm *LLMClient) *DeepSeekChatModel {
	return &DeepSeekChatModel{client: llm}
}

// Generate implements model.BaseChatModel.
// Properly handles tool definitions via model.GetCommonOptions + model.WithTools.
func (m *DeepSeekChatModel) Generate(ctx context.Context, input []*schema.Message, opts ...model.Option) (*schema.Message, error) {
	// Extract options (including tools from model.WithTools)
	commonOpts := model.GetCommonOptions(&model.Options{}, opts...)

	// Merge instance tools + per-call tools
	allToolInfos := append([]*schema.ToolInfo{}, m.tools...)
	allToolInfos = append(allToolInfos, commonOpts.Tools...)

	// Convert messages to OpenAI format
	openaiMsgs := convertMessages(input)

	if len(allToolInfos) > 0 {
		// Convert tool infos to OpenAI tools
		openaiTools := convertToolInfos(allToolInfos)
		commonOpts.Tools = allToolInfos

		resp, err := m.client.ChatWithToolCalls(ctx, openaiMsgs, openaiTools)
		if err != nil {
			return nil, fmt.Errorf("chat with tools: %w", err)
		}

		return openaiResponseToSchema(resp), nil
	}

	// Plain chat path
	resp, err := m.client.ChatWithToolCalls(ctx, openaiMsgs, nil)
	if err != nil {
		return nil, fmt.Errorf("chat: %w", err)
	}

	return openaiResponseToSchema(resp), nil
}

// Stream is not fully implemented — returns single response wrapped as stream.
func (m *DeepSeekChatModel) Stream(ctx context.Context, input []*schema.Message, opts ...model.Option) (*schema.StreamReader[*schema.Message], error) {
	sr, sw := schema.Pipe[*schema.Message](3)
	go func() {
		defer sw.Close()
		msg, err := m.Generate(ctx, input, opts...)
		if err != nil {
			sw.Send(nil, err)
			return
		}
		sw.Send(msg, nil)
	}()
	return sr, nil
}

// WithTools implements model.ToolCallingChatModel.
func (m *DeepSeekChatModel) WithTools(tools []*schema.ToolInfo) (model.ToolCallingChatModel, error) {
	newModel := &DeepSeekChatModel{
		client: m.client,
		tools:  append([]*schema.ToolInfo{}, tools...),
	}
	return newModel, nil
}

// BindTools sets tools on the model.
func (m *DeepSeekChatModel) BindTools(tools []*schema.ToolInfo) {
	m.tools = tools
}

// ========== Conversion helpers ==========

// convertMessages converts EINO schema.Messages to OpenAI ChatCompletionMessage format.
func convertMessages(in []*schema.Message) []openai.ChatCompletionMessage {
	out := make([]openai.ChatCompletionMessage, 0, len(in))
	for _, msg := range in {
		m := openai.ChatCompletionMessage{
			Role:    string(msg.Role),
			Content: msg.Content,
		}
		// Preserve tool call results
		if msg.Role == schema.Tool {
			m.ToolCallID = msg.ToolCallID
			m.Name = msg.ToolName
		}
		// Preserve tool calls from assistant messages
		if len(msg.ToolCalls) > 0 {
			m.ToolCalls = convertToolCalls(msg.ToolCalls)
		}
		out = append(out, m)
	}
	return out
}

// convertToolInfos converts EINO ToolInfo to OpenAI Tool format.
func convertToolInfos(infos []*schema.ToolInfo) []openai.Tool {
	tools := make([]openai.Tool, 0, len(infos))
	for _, info := range infos {
		tool := openai.Tool{
			Type: "function",
			Function: &openai.FunctionDefinition{
				Name:        info.Name,
				Description: info.Desc,
			},
		}
		// Convert ParamsOneOf to JSON Schema if present
		if info.ParamsOneOf != nil {
			params, err := info.ParamsOneOf.ToJSONSchema()
			if err == nil && params != nil {
				tool.Function.Parameters = anyToMap(params)
			}
		}
		tools = append(tools, tool)
	}
	return tools
}

// convertToolCalls converts EINO ToolCall to OpenAI ToolCall format.
func convertToolCalls(in []schema.ToolCall) []openai.ToolCall {
	out := make([]openai.ToolCall, 0, len(in))
	for _, tc := range in {
		out = append(out, openai.ToolCall{
			ID:   tc.ID,
			Type: openai.ToolTypeFunction,
			Function: openai.FunctionCall{
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			},
		})
	}
	return out
}

// openaiResponseToSchema converts OpenAI response to EINO schema.Message.
func openaiResponseToSchema(resp *openai.ChatCompletionResponse) *schema.Message {
	if len(resp.Choices) == 0 {
		return schema.AssistantMessage("", nil)
	}
	choice := resp.Choices[0]
	msg := choice.Message

	// Convert OpenAI ToolCalls back to EINO format
	var toolCalls []schema.ToolCall
	for _, tc := range msg.ToolCalls {
		toolCalls = append(toolCalls, schema.ToolCall{
			ID:   tc.ID,
			Type: string(tc.Type),
			Function: schema.FunctionCall{
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			},
		})
	}

	return &schema.Message{
		Role:      schema.Assistant,
		Content:   msg.Content,
		ToolCalls: toolCalls,
	}
}

// anyToMap converts a JSON-marshalable value to map[string]any.
func anyToMap(v any) map[string]any {
	data, _ := json.Marshal(v)
	var m map[string]any
	json.Unmarshal(data, &m)
	return m
}

// messagesToPrompts converts messages to system + user strings for legacy use.
func messagesToPrompts(messages []*schema.Message) (system, user string) {
	for _, msg := range messages {
		switch msg.Role {
		case schema.System:
			if system != "" {
				system += "\n"
			}
			system += msg.Content
		case schema.User:
			if user != "" {
				user += "\n"
			}
			user += msg.Content
		case schema.Assistant:
			if msg.Content != "" {
				if user != "" {
					user += "\n"
				}
				user += "[Assistant]: " + msg.Content
			}
		case schema.Tool:
			if user != "" {
				user += "\n"
			}
			user += fmt.Sprintf("[Tool %s]: %s", msg.ToolName, msg.Content)
		}
	}
	return
}
