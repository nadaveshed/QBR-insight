export const QUEUE_NAME = 'qbr-processing';
export const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800, count: 1000 },
};
