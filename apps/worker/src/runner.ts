import { handleWorkflowJob, type WorkflowJobServices } from "./jobs.js";
import type { WorkflowJobRepository } from "./repository.js";

export type WorkerRunnerOptions = {
  repository: WorkflowJobRepository;
  services?: WorkflowJobServices;
  workerId: string;
  batchSize: number;
};

export async function runWorkerBatch(options: WorkerRunnerOptions): Promise<{
  claimed: number;
  completed: number;
  failed: number;
}> {
  const jobs = await options.repository.claimJobs({
    workerId: options.workerId,
    batchSize: options.batchSize,
  });

  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await handleWorkflowJob(job, options.services);
      await options.repository.markCompleted({
        jobId: job.id,
        status: result.status,
        message: result.message,
      });
      completed += 1;
    } catch (error) {
      await options.repository.markFailed({
        job,
        errorCode: "worker_job_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      failed += 1;
    }
  }

  return {
    claimed: jobs.length,
    completed,
    failed,
  };
}
