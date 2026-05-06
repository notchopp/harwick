import { createLogger } from "@realty-ops/core";
import { parseWorkerEnvironment, mergeLocalEnvFallback } from "./environment.js";
import {
  createSupabaseWorkflowJobServices,
  createSupabaseWorkflowJobRepository,
  createWorkerSupabaseClient,
} from "./repository.js";
import { runWorkerBatch } from "./runner.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const environment = parseWorkerEnvironment(mergeLocalEnvFallback());
const logger = createLogger({
  service: "worker",
  environment: environment.APP_ENV,
});
const supabase = createWorkerSupabaseClient(environment);
const repository = createSupabaseWorkflowJobRepository(supabase);
const services = createSupabaseWorkflowJobServices(supabase, {
  credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
  followUpBossApiKey: environment.FOLLOWUPBOSS_API_KEY,
  twilio: environment.TWILIO_ACCOUNT_SID === undefined
    || environment.TWILIO_AUTH_TOKEN === undefined
    || environment.TWILIO_PHONE_NUMBER === undefined
    ? undefined
    : {
        accountSid: environment.TWILIO_ACCOUNT_SID,
        authToken: environment.TWILIO_AUTH_TOKEN,
        fromPhoneNumber: environment.TWILIO_PHONE_NUMBER,
      },
});

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

while (!shuttingDown) {
  try {
    const result = await runWorkerBatch({
      repository,
      services,
      workerId: environment.WORKER_ID,
      batchSize: environment.WORKER_BATCH_SIZE,
    });

    if (result.claimed > 0) {
      logger.info("workflow batch processed", {
        workerId: environment.WORKER_ID,
        claimed: result.claimed,
        completed: result.completed,
        failed: result.failed,
      });
    }
  } catch (error) {
    logger.error("workflow batch failed", {
      workerId: environment.WORKER_ID,
      error,
    });
  }

  await wait(environment.WORKER_POLL_INTERVAL_MS);
}

logger.info("worker shutdown complete", {
  workerId: environment.WORKER_ID,
});
