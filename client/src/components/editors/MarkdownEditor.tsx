import React, { useState, useCallback, Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

// Import MDEditor lazily for code splitting
const MDEditor = lazy(() => import('@uiw/react-md-editor').then((mod) => ({ default: mod.default })));

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  height?: number;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = "Write your markdown here...",
  height = 300
}) => {
  return (
    <div data-color-mode="dark">
      <Suspense fallback={
        <div className="flex justify-center items-center h-[300px] border border-dashed border-gray-700 rounded-md">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }>
        <MDEditor
          value={value}
          onChange={onChange}
          preview="edit"
          height={height}
          textareaProps={{
            placeholder: placeholder
          }}
        />
      </Suspense>
    </div>
  );
};

export default MarkdownEditor;