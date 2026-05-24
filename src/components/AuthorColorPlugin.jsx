import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $getSelection, $isRangeSelection } from 'lexical';

export default function AuthorColorPlugin({ color }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerTextContentListener(() => {
      editor.update(() => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) return;

        const nodes = selection.getNodes();

        nodes.forEach((node) => {
          if (node.setStyle && !node.getStyle()) {
            node.setStyle(`color: ${color}`);
          }
        });
      });
    });
  }, [editor, color]);

  return null;
}
