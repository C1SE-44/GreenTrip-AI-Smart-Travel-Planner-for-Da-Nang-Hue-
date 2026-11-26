// Lucian UX/UI Prompt #086 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#086
import type { ReactNode } from 'react';
import AiThinkingDisclosure from './AiThinkingDisclosure';
import './AiStreamingShell.css';

export interface AiStreamingShellProps {
  isStreaming: boolean;
  hasContent: boolean;
  statusText?: string | null;
  thinkingSteps?: string[];
  children?: ReactNode;
  className?: string;
}

export default function AiStreamingShell({
  isStreaming,
  hasContent,
  statusText,
  thinkingSteps,
  children,
  className = '',
}: AiStreamingShellProps) {
  return (
    <div
      aria-live="polite"
      className={`ux u086-shell ${isStreaming ? 'is-gen' : ''} ${className}`.trim()}
    >
      <span className="u086-av" aria-hidden="true" />
      <div className="u086-body">
        {hasContent ? (
          <div>
            {children}
            {isStreaming ? <span className="u086-caret" aria-hidden="true" /> : null}
          </div>
        ) : (
          <div className="space-y-1">
            <AiThinkingDisclosure
              isThinking={isStreaming}
              thinkingLabel={statusText || 'Đang tra cứu Đồ thị Tri thức Miền Trung…'}
              steps={thinkingSteps}
            />
            <span className="u086-dots" aria-label="Đang tạo câu trả lời">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
