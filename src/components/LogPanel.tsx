import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, Download } from 'lucide-react';

interface LogPanelProps {
  logs: string[];
  onClear: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, onClear }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const exportLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orion_fireguard_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col rounded-lg border border-[#42505e] bg-[#171d24] p-3 shadow">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between border-b border-[#303b46] pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#67c5ad]" />
          <h2 className="text-sm font-semibold tracking-wide text-[#67c5ad]">
            EVENT / SERIAL LOG
          </h2>
          <span className="text-[11px] text-[#84909b]">({logs.length} entries)</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={exportLogs}
            className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2 py-0.5 text-[#e6edf3] transition hover:bg-[#3e4c59]"
            title="Download log history"
          >
            <Download className="h-3 w-3 text-sky-400" />
            <span>Export</span>
          </button>
          <button
            onClick={onClear}
            className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2 py-0.5 text-[#e6edf3] transition hover:bg-[#3e4c59]"
          >
            <Trash2 className="h-3 w-3 text-rose-400" />
            <span>Clear visible log</span>
          </button>
        </div>
      </div>

      {/* Log view */}
      <div
        ref={containerRef}
        className="h-32 overflow-y-auto rounded border border-[#42505e] bg-[#151b21] p-2.5 font-mono text-xs leading-relaxed text-[#d9e2ec]"
      >
        {logs.length === 0 ? (
          <div className="text-[#84909b] italic">No event logs recorded.</div>
        ) : (
          logs.map((line, idx) => {
            let badgeColor = 'text-gray-400';
            if (line.startsWith('RX')) badgeColor = 'text-sky-400 font-bold';
            else if (line.startsWith('TX')) badgeColor = 'text-amber-400 font-bold';
            else if (line.startsWith('SIM AIM')) badgeColor = 'text-purple-400 font-bold';
            else if (line.startsWith('HIST')) badgeColor = 'text-gray-500';
            else if (line.includes('failed') || line.includes('ERR')) badgeColor = 'text-rose-400 font-bold';
            else if (line.includes('saved') || line.includes('connected')) badgeColor = 'text-emerald-400';

            return (
              <div key={idx} className="flex gap-2 border-b border-[#202830]/60 py-0.5">
                <span className="text-[10px] text-[#526170] select-none">
                  {String(idx + 1).padStart(3, '0')}
                </span>
                <span className={badgeColor}>{line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
