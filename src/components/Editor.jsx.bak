// src/components/Editor.jsx
import React, { useMemo, useEffect, useCallback } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS, $convertToMarkdownString } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ParagraphNode, TextNode } from "lexical";
import { getSharedDoc, getSharedProvider, checkAndSync, isAdmin } from "../utils/collaboration";

// Auto-save logic component
function AutoSavePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let timeout;
    const save = () => {
      editor.getEditorState().read(() => {
        const markdown = $convertToMarkdownString(TRANSFORMERS);
        fetch('/api/archive-today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: markdown })
        }).catch(err => console.error("Save failed", err));
      });
    };

    // Listen for updates and debounce to prevent spamming the server
    return editor.registerUpdateListener(() => {
      clearTimeout(timeout);
      timeout = setTimeout(save, 2000); // Saves 2 seconds after last change
    });
  }, [editor]);

  return null;
}

const USERNAMES = ['hedgehog', 'shark', 'otter', 'eagle', 'wolf', 'fox', 'bear', 'owl'];
const USERNAME = USERNAMES[Math.floor(Math.random() * USERNAMES.length)];

export default function Editor() {
  const readonly = !isAdmin();
  useEffect(() => { checkAndSync(); }, []);

  const doc = useMemo(() => getSharedDoc(), []);
  const provider = useMemo(() => getSharedProvider({ readonly, username: USERNAME }), [readonly]);

  const providerFactory = (id, yjsDocMap) => {
    yjsDocMap.set(id, doc);
    return provider;
  };

  const initialConfig = {
    namespace: "CrousiaEditor",
    editable: !readonly,
    nodes: [ParagraphNode, TextNode, HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode],
    theme: { paragraph: "editor-paragraph" },
    onError(error) { console.error("Lexical error:", error); }
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container">
        <CollaborationPlugin
          id="crousia-editor"
          providerFactory={providerFactory}
          username={USERNAME}
        />
        <AutoSavePlugin />
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          placeholder={<div>Start writing...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      </div>
    </LexicalComposer>
  );
}