'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  RemoveFormatting,
  Plus,
  Minus,
} from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { FONT_OPTIONS, FONT_SIZES, LINE_SPACINGS } from '@/lib/fonts';

const BRAND_COLORS = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#E5322D' },
  { name: 'Blue', hex: '#1F5FBF' },
  { name: 'Green', hex: '#1E9E55' },
  { name: 'Yellow', hex: '#F2B705' },
  { name: 'Gray', hex: '#6B6B6B' },
];

export function TextToolbar() {
  const { jobs, activeJobId, updateElement } = useSessionStore();
  const { selected, activeEditor } = useUiStore();

  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const colorPopoverRef = useRef<HTMLDivElement>(null);
  const highlightPopoverRef = useRef<HTMLDivElement>(null);

  // Close color popovers on outside click
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (
        colorPopoverRef.current &&
        !colorPopoverRef.current.contains(e.target as Node)
      ) {
        setColorOpen(false);
      }
      if (
        highlightPopoverRef.current &&
        !highlightPopoverRef.current.contains(e.target as Node)
      ) {
        setHighlightOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const selectedPage = selected
    ? activeJob?.pages.find((p) => p.id === selected.pageId)
    : null;
  const selectedElement = selectedPage && selected
    ? selectedPage.elements.find((el) => el.id === selected.elementId)
    : null;

  const isTextSelected = selectedElement?.type === 'text';
  const editor = activeEditor as Editor | null;

  // Active mark / formatting queries
  const isBold = editor?.isActive('bold') ?? false;
  const isItalic = editor?.isActive('italic') ?? false;
  const isUnderline = editor?.isActive('underline') ?? false;
  const isStrike = editor?.isActive('strike') ?? false;
  const isBulletList = editor?.isActive('bulletList') ?? false;
  const isOrderedList = editor?.isActive('orderedList') ?? false;

  const isAlignLeft = editor?.isActive({ textAlign: 'left' }) ?? false;
  const isAlignCenter = editor?.isActive({ textAlign: 'center' }) ?? false;
  const isAlignRight = editor?.isActive({ textAlign: 'right' }) ?? false;
  const isAlignJustify = editor?.isActive({ textAlign: 'justify' }) ?? false;

  // Current font family and size
  const currentFontFamily =
    editor?.getAttributes('textStyle').fontFamily || 'Arial';
  const currentFontSizeStr =
    editor?.getAttributes('textStyle').fontSize || '14pt';
  const currentFontSizeNum =
    parseInt(currentFontSizeStr.replace('pt', ''), 10) || 14;

  const currentColor =
    editor?.getAttributes('textStyle').color || '#111111';
  const currentHighlight =
    editor?.getAttributes('highlight').color || null;
  const currentLineHeight =
    editor?.getAttributes('paragraph').lineHeight ||
    editor?.getAttributes('heading').lineHeight ||
    '1.2';

  // Run formatting command helper
  const runFormat = (action: (ed: Editor) => void) => {
    if (!editor || !selectedElement || !selected) return;

    if (editor.isEditable) {
      action(editor);
    } else {
      // Temporarily set editable to apply command across all text
      editor.setEditable(true);
      editor.chain().selectAll().run();
      action(editor);
      editor.setEditable(false);

      // Write once to store via commit + updateElement
      updateElement(activeJob.id, selected.pageId, selected.elementId, {
        html: editor.getHTML(),
      });
    }
  };

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    runFormat((ed) => {
      if (val === 'Arial') {
        ed.chain().focus().unsetFontFamily().run();
      } else {
        ed.chain().focus().setFontFamily(val).run();
      }
    });
  };

  const handleSizeChange = (pt: number) => {
    const clamped = Math.min(400, Math.max(1, pt));
    runFormat((ed) => {
      ed.chain().focus().setFontSize(`${clamped}pt`).run();
    });
  };

  const stepFontSize = (delta: number) => {
    let nextSize = currentFontSizeNum + delta;
    if (delta > 0) {
      const bigger = FONT_SIZES.find((s) => s > currentFontSizeNum);
      nextSize = bigger ?? currentFontSizeNum + 1;
    } else {
      const smaller = [...FONT_SIZES].reverse().find((s) => s < currentFontSizeNum);
      nextSize = smaller ?? currentFontSizeNum - 1;
    }
    handleSizeChange(nextSize);
  };

  const handleLineSpacingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    runFormat((ed) => {
      ed.chain().focus().setLineHeight(val).run();
    });
  };

  const handleColorSelect = (hex: string) => {
    setColorOpen(false);
    runFormat((ed) => {
      ed.chain().focus().setColor(hex).run();
    });
  };

  const handleHighlightSelect = (hex: string | null) => {
    setHighlightOpen(false);
    runFormat((ed) => {
      if (!hex) {
        ed.chain().focus().unsetHighlight().run();
      } else {
        ed.chain().focus().setHighlight({ color: hex }).run();
      }
    });
  };

  const handleClearFormatting = () => {
    runFormat((ed) => {
      ed.chain().focus().clearNodes().unsetAllMarks().run();
    });
  };

  return (
    <div className="h-10 shrink-0 bg-paper border-b border-line px-3 flex items-center gap-1.5 select-none text-xs text-ink z-20 overflow-x-auto">
      {!isTextSelected ? (
        <span className="text-muted text-xs italic">
          Select a text box to format text
        </span>
      ) : (
        <>
          {/* Font Family Select */}
          <select
            value={currentFontFamily}
            onChange={handleFontChange}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-7 px-2 border border-line rounded-[6px] bg-paper text-ink text-xs focus:outline-none focus:border-blue cursor-pointer max-w-[140px]"
          >
            {FONT_OPTIONS.map((f) => (
              <option
                key={f.name}
                value={f.name}
                style={{ fontFamily: f.family }}
              >
                {f.name}
              </option>
            ))}
          </select>

          {/* Font Size Step & Input */}
          <div className="flex items-center border border-line rounded-[6px] bg-paper h-7 overflow-hidden">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepFontSize(-1)}
              className="px-1.5 h-full hover:bg-surface text-muted hover:text-ink cursor-pointer"
              title="Decrease font size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="number"
              min={1}
              max={400}
              value={currentFontSizeNum}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) handleSizeChange(val);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-9 h-full text-center text-xs text-ink focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepFontSize(1)}
              className="px-1.5 h-full hover:bg-surface text-muted hover:text-ink cursor-pointer"
              title="Increase font size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-line mx-0.5" />

          {/* Bold, Italic, Underline, Strikethrough */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().toggleBold().run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isBold
                  ? 'bg-blue/15 text-blue font-bold'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().toggleItalic().run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isItalic
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().toggleUnderline().run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isUnderline
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Underline (Ctrl+U)"
            >
              <UnderlineIcon className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().toggleStrike().run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isStrike
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-line mx-0.5" />

          {/* Text Color Popover */}
          <div className="relative" ref={colorPopoverRef}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setColorOpen(!colorOpen);
                setHighlightOpen(false);
              }}
              className="p-1 rounded-[6px] border border-line hover:border-muted flex items-center gap-1 cursor-pointer bg-paper"
              title="Text Color"
            >
              <span
                className="w-3.5 h-3.5 rounded-[3px] border border-line"
                style={{ backgroundColor: currentColor }}
              />
              <span className="text-[10px] text-muted">A</span>
            </button>
            {colorOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 p-2 bg-paper border border-line rounded-[8px] shadow-lg flex flex-col gap-2 min-w-[130px]">
                <span className="text-[10px] font-semibold text-muted uppercase">Text Color</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleColorSelect(c.hex)}
                      className="w-5 h-5 rounded-[4px] border border-line cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-line text-[11px]">
                  <span className="text-muted text-[10px]">Custom:</span>
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    className="w-5 h-5 p-0 border border-line rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Highlight Color Popover */}
          <div className="relative" ref={highlightPopoverRef}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setHighlightOpen(!highlightOpen);
                setColorOpen(false);
              }}
              className="p-1 rounded-[6px] border border-line hover:border-muted flex items-center gap-1 cursor-pointer bg-paper"
              title="Highlight Color"
            >
              <span
                className="w-3.5 h-3.5 rounded-[3px] border border-line"
                style={{ backgroundColor: currentHighlight || 'transparent' }}
              />
              <span className="text-[10px] text-muted">HL</span>
            </button>
            {highlightOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 p-2 bg-paper border border-line rounded-[8px] shadow-lg flex flex-col gap-2 min-w-[130px]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted uppercase">Highlight</span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleHighlightSelect(null)}
                    className="text-[10px] text-red hover:underline cursor-pointer"
                  >
                    None
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleHighlightSelect(c.hex)}
                      className="w-5 h-5 rounded-[4px] border border-line cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-line text-[11px]">
                  <span className="text-muted text-[10px]">Custom:</span>
                  <input
                    type="color"
                    value={currentHighlight || '#ffff00'}
                    onChange={(e) => handleHighlightSelect(e.target.value)}
                    className="w-5 h-5 p-0 border border-line rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-line mx-0.5" />

          {/* Text Alignment */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().setTextAlign('left').run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isAlignLeft || (!isAlignCenter && !isAlignRight && !isAlignJustify)
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Align left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().setTextAlign('center').run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isAlignCenter
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Align center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().setTextAlign('right').run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isAlignRight
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Align right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().setTextAlign('justify').run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isAlignJustify
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Justify"
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-line mx-0.5" />

          {/* Bullet and Numbered Lists */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().toggleBulletList().run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isBulletList
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Bullet list"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFormat((ed) => ed.chain().focus().toggleOrderedList().run())}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                isOrderedList
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
              title="Numbered list"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-line mx-0.5" />

          {/* Line Spacing */}
          <select
            value={currentLineHeight}
            onChange={handleLineSpacingChange}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-7 px-1.5 border border-line rounded-[6px] bg-paper text-ink text-xs focus:outline-none focus:border-blue cursor-pointer"
            title="Line Spacing"
          >
            {LINE_SPACINGS.map((ls) => (
              <option key={ls.value} value={ls.value}>
                {ls.label}
              </option>
            ))}
          </select>

          {/* Clear Formatting */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClearFormatting}
            className="p-1.5 rounded-[6px] text-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer ml-auto"
            title="Clear formatting"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
