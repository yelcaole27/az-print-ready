'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize, LineHeight } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { PageElement } from '@/types';
import { MM_TO_PX } from '@/lib/pageGeometry';
import { useUiStore } from '@/store/useUiStore';

interface TextBoxEditorProps {
  element: PageElement;
  pageH: number;
  zoom: number;
  isEditing: boolean;
  onCommit: (newHtml: string, newHMm?: number) => void;
  onOverflowChange?: (isOverflow: boolean) => void;
}

export function TextBoxEditor({
  element,
  pageH,
  zoom,
  isEditing,
  onCommit,
  onOverflowChange,
}: TextBoxEditorProps) {
  const { setActiveEditor } = useUiStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const startHMmRef = useRef(element.hMm);
  const [liveHMm, setLiveHMm] = useState<number | null>(null);

  const initialHtml = element.html || '<p></p>';
  const latestHtmlRef = useRef(initialHtml);
  const latestHMmRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: isEditing,
    content: initialHtml,
    extensions: [
      StarterKit.configure({
        dropcursor: false,
      }),
      TextStyle,
      Color,
      FontFamily,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      FontSize,
      LineHeight,
    ],
    editorProps: {
      transformPastedText(text) {
        return text;
      },
      transformPastedHTML(html) {
        // Strip foreign formatting: keep only plain text
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const text = temp.textContent || temp.innerText || '';
        return text
          .split(/\r?\n/)
          .map((line) => `<p>${line || '<br>'}</p>`)
          .join('');
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain');
        if (text) {
          event.preventDefault();
          const docNode = view.state.schema.nodeFromJSON({
            type: 'doc',
            content: text
              .split(/\r?\n/)
              .map((p) => ({
                type: 'paragraph',
                content: p ? [{ type: 'text', text: p }] : [],
              })),
          });
          if (docNode.content) {
            view.dispatch(view.state.tr.replaceSelectionWith(docNode));
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const currentHtml = ed.getHTML();
      latestHtmlRef.current = currentHtml;
      checkHeightAndOverflow();
    },
  });

  // Track active editor in store for TextToolbar commands
  useEffect(() => {
    if (isEditing && editor) {
      setActiveEditor(editor);
      return () => {
        setActiveEditor(null);
      };
    }
  }, [isEditing, editor, setActiveEditor]);

  // Focus editor on mount or when entering edit mode
  useEffect(() => {
    if (editor && isEditing) {
      if (!editor.isEditable) {
        editor.setEditable(true);
      }
      startHMmRef.current = element.hMm;
      const frame = requestAnimationFrame(() => {
        editor.commands.focus('end');
      });
      return () => cancelAnimationFrame(frame);
    } else if (editor && !isEditing && editor.isEditable) {
      editor.setEditable(false);
    }
  }, [isEditing, editor, element.hMm]);

  // Commit on unmount or when isEditing transitions to false
  useEffect(() => {
    return () => {
      onCommitRef.current(latestHtmlRef.current, latestHMmRef.current ?? undefined);
    };
  }, [element.id]);

  const checkHeightAndOverflow = useCallback(() => {
    if (!contentRef.current) return;
    const paddingMm = element.paddingMm ?? 2;
    const paddingPx = paddingMm * MM_TO_PX;
    const borderMm = element.borderMm ?? 0;
    const borderPx = borderMm * MM_TO_PX;

    const scrollH = contentRef.current.scrollHeight;
    const innerBoxH = (element.hMm * MM_TO_PX) - 2 * (paddingPx + borderPx);

    if (element.autoGrow && isEditing) {
      const neededHMm = scrollH / MM_TO_PX + 2 * paddingMm + 2 * borderMm;
      const maxHMm = pageH - element.yMm;
      const grownHMm = Math.max(startHMmRef.current, Math.min(maxHMm, neededHMm));
      setLiveHMm(grownHMm);
      latestHMmRef.current = grownHMm;

      const isOverflowNow = neededHMm > maxHMm;
      onOverflowChange?.(isOverflowNow);
    } else {
      const isOverflowNow = scrollH > innerBoxH + 2;
      onOverflowChange?.(isOverflowNow);
    }
  }, [
    element.autoGrow,
    element.borderMm,
    element.hMm,
    element.paddingMm,
    element.yMm,
    isEditing,
    onOverflowChange,
    pageH,
  ]);

  // Run initial height check
  useEffect(() => {
    if (editor) {
      checkHeightAndOverflow();
    }
  }, [editor, checkHeightAndOverflow]);

  const vAlign = element.vAlign || 'top';
  let justifyContent = 'flex-start';
  if (vAlign === 'middle') justifyContent = 'center';
  if (vAlign === 'bottom') justifyContent = 'flex-end';

  const paddingPx = (element.paddingMm ?? 2) * MM_TO_PX;
  const borderPx = (element.borderMm ?? 0) * MM_TO_PX;
  const borderColor = element.borderColor || '#111111';
  const fillColor = element.fillColor || 'transparent';

  // Zoom-1 footprint size in px
  const currentHMm = liveHMm ?? element.hMm;
  const baseWPx = element.wMm * MM_TO_PX;
  const baseHPx = currentHMm * MM_TO_PX;

  return (
    <div
      style={{
        width: `${baseWPx}px`,
        height: `${baseHPx}px`,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        backgroundColor: fillColor,
        borderWidth: `${borderPx}px`,
        borderStyle: borderPx > 0 ? 'solid' : 'none',
        borderColor: borderColor,
        padding: `${paddingPx}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        boxSizing: 'border-box',
      }}
      className="sheet-text-container select-text cursor-text pointer-events-auto"
      ref={contentRef}
    >
      {editor && <EditorContent editor={editor} className="w-full select-text pointer-events-auto" />}
    </div>
  );
}
