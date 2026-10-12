'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';

export function JobTabs() {
  const { jobs, activeJobId, setActiveJob, addJob, removeJob } = useSessionStore();

  return (
    <div className="h-9 bg-paper border-b border-line px-3 flex items-center gap-1 shrink-0 overflow-x-auto select-none">
      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {jobs.map((job) => {
          const isActive = job.id === activeJobId;
          const isOnlyJob = jobs.length <= 1;

          return (
            <div
              key={job.id}
              onClick={() => setActiveJob(job.id)}
              className={`group relative h-8 px-3 flex items-center gap-2 text-xs font-medium cursor-pointer transition-colors border-b-2 ${
                isActive
                  ? 'text-ink border-blue bg-surface/60'
                  : 'text-muted border-transparent hover:text-ink hover:bg-surface/30'
              }`}
            >
              <span className="truncate max-w-[120px]">{job.name}</span>

              {!isOnlyJob && (
                <button
                  type="button"
                  aria-label={`Close ${job.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeJob(job.id);
                  }}
                  className="w-4 h-4 rounded-[4px] inline-flex items-center justify-center text-muted hover:text-red hover:bg-line transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addJob}
        aria-label="Add new job"
        title="Add new job"
        className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-muted hover:text-ink hover:bg-surface border border-line transition-colors cursor-pointer shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
