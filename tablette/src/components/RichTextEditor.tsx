/* Éditeur de texte riche léger — Tiptap (Bold, Italic, Underline, Align, BulletList) */
import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;       // HTML string
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Saisir le contenu…',
  minHeight = '80px',
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      TextAlign.configure({ types: ['paragraph', 'listItem'] }),
      Underline,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none text-sm leading-relaxed',
        style: `min-height: ${minHeight}`,
        'data-placeholder': placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      // Évite de renvoyer <p></p> vide comme contenu non-vide
      const isEmpty = editor.isEmpty;
      onChange(isEmpty ? '' : html, text);
    },
  });

  // Synchronise si la valeur change depuis l'extérieur (changement de slide)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalised = !value || value === '<p></p>' ? '' : value;
    const normalisedCurrent = !current || current === '<p></p>' ? '' : current;
    if (normalised !== normalisedCurrent) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const ToolBtn = ({
    active, onClick, title, children,
  }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'ghost'}
      className={cn('h-7 w-7 p-0 shrink-0', active && 'bg-primary text-primary-foreground')}
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
    >
      {children}
    </Button>
  );

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden bg-background', className)}>
      {/* Barre d'outils */}
      <div className="flex items-center gap-0.5 px-1 py-1 bg-secondary/60 border-b border-border flex-wrap">
        <ToolBtn active={editor.isActive('bold')} title="Gras (Ctrl+B)"
          onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive('italic')} title="Italique (Ctrl+I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive('underline')} title="Souligné (Ctrl+U)"
          onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolBtn active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'center' })} title="Centrer"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolBtn active={editor.isActive('bulletList')} title="Liste à puces"
          onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Zone de saisie */}
      <EditorContent
        editor={editor}
        className="px-3 py-2 rich-editor-content"
      />
    </div>
  );
}
