import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Import MDEditor dynamically to avoid SSR issues
const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center h-[300px] border border-dashed border-gray-700 rounded-md">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
);

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
      <MDEditor
        value={value}
        onChange={onChange}
        preview="edit"
        height={height}
        textareaProps={{
          placeholder: placeholder
        }}
      />
    </div>
  );
};

export default MarkdownEditor;