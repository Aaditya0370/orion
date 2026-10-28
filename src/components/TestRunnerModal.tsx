import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, Play, Cpu } from 'lucide-react';
import { runAllCoreTests, TestResult } from '../core/tests';

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => {
      const res = runAllCoreTests();
      setResults(res);
      setRunning(false);
    }, 150);
  };

  useEffect(() => {
    executeTests();
  }, []);

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-[#42505e] bg-[#202830] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#303b46] px-5 py-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-[#67c5ad]" />
            <div>
              <h3 className="text-base font-bold text-[#67c5ad]">
                CORE VERIFICATION TEST SUITE
              </h3>
              <p className="text-xs text-[#84909b]">
                Automated tests ported from <code>tests/test_core.py</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#84909b] transition hover:bg-[#303b46] hover:text-[#e6edf3]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results summary bar */}
        <div className="flex items-center justify-between border-b border-[#303b46] bg-[#171d24] px-5 py-2.5 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[#e6edf3]">
              Summary: {passed}/{total} Tests Passed
            </span>
            {failed === 0 ? (
              <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-emerald-300 font-bold">
                ALL TESTS GREEN
              </span>
            ) : (
              <span className="rounded bg-rose-950/60 border border-rose-500/40 px-2 py-0.5 text-rose-300 font-bold">
                {failed} FAILED
              </span>
            )}
          </div>

          <button
            onClick={executeTests}
            disabled={running}
            className="flex items-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-3 py-1 text-xs font-medium text-[#e6edf3] hover:bg-[#3e4c59] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 text-[#67c5ad]" />
            <span>{running ? 'Running...' : 'Re-run Tests'}</span>
          </button>
        </div>

        {/* Test items list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 text-xs font-mono">
          {results.map((r, idx) => (
            <div
              key={idx}
              className={`flex items-start justify-between rounded border p-2.5 ${
                r.passed
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-[#e6edf3]'
                  : 'border-rose-500/50 bg-rose-950/30 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {r.passed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-[#67c5ad]">{r.suite}</div>
                  <div className="text-gray-300">{r.name}</div>
                  {r.error && (
                    <div className="mt-1 text-rose-300 bg-rose-950/80 p-1.5 rounded border border-rose-800 text-[11px]">
                      {r.error}
                    </div>
                  )}
                </div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  r.passed
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {r.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#303b46] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded border border-[#526170] bg-[#303b46] px-4 py-1.5 text-xs text-[#e6edf3] hover:bg-[#3e4c59]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
