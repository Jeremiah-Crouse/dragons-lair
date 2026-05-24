import React, { useState, useRef, useEffect } from 'react';
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { serpentGenerate } from '../../eveService';

export function EveButton({ yText, awareness }) {
  const [editor] = useLexicalComposerContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [reasoning, setReasoning] = useState('');
  const reasoningBuf = useRef('');
  const buttonRef = useRef(null);
  const reasoningRef = useRef(null);
  const scrollPos = useRef(0);

  // Auto-scroll reasoning text to show latest
  useEffect(() => {
    if (reasoning && reasoningRef.current) {
      const el = reasoningRef.current;
      const ch = reasoning.length;
      const visible = Math.floor(el.clientWidth / 8);
      if (ch > visible) scrollPos.current = ch - visible;
      else scrollPos.current = 0;
      el.scrollLeft = scrollPos.current * 8;
    }
  }, [reasoning]);

  const handleClick = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setReasoning('');
    reasoningBuf.current = '';
    scrollPos.current = 0;
    setStatus('Summoning the Serpent...');

    await serpentGenerate(
      editor,
      awareness,
      (msg) => setStatus(msg),
      (text) => {
        if (text === null) {
          setReasoning('');
          reasoningBuf.current = '';
        } else {
          reasoningBuf.current += text;
          setReasoning(reasoningBuf.current);
        }
      },
    );
    setStatus('');
    setReasoning('');
    reasoningBuf.current = '';
    setIsGenerating(false);
  };

  const showMarquee = isGenerating && reasoning;

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      disabled={isGenerating}
      style={{
        backgroundColor: isGenerating ? '#222' : '#00D1B2',
        color: '#00D1B2',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer',
        overflow: 'hidden',
        maxWidth: '300px',
        fontFamily: 'monospace',
        fontSize: '12px',
        height: '32px',
        position: 'relative',
      }}
    >
      {showMarquee ? (
        <div
          ref={reasoningRef}
          style={{
            color: '#cc3300',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'clip',
            width: '100%',
            textAlign: 'left',
            lineHeight: '16px',
          }}
        >
          {reasoning}
        </div>
      ) : (
        <span style={{ color: isGenerating ? '#aaa' : '#000' }}>{status || 'Summon the Serpent'}</span>
      )}
    </button>
  );
}
