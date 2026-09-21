import { runScenario } from '../lib/scenario';
import type { ScenarioResult, ScenarioSettings } from '../lib/learning-types';

type ScenarioRequest = { id: number; settings: ScenarioSettings };
type ScenarioSuccess = { id: number; result: ScenarioResult };
type ScenarioFailure = { id: number; error: string };

const workerScope = self as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<ScenarioRequest>) => void) => void;
  postMessage: (message: ScenarioSuccess | ScenarioFailure) => void;
};

workerScope.addEventListener('message', (event: MessageEvent<ScenarioRequest>) => {
  const request = event.data;
  if (!request || typeof request.id !== 'number') {
    const invalidResponse: ScenarioFailure = { id: -1, error: 'Invalid worker request: expected { id:number, settings }. ' };
    workerScope.postMessage(invalidResponse);
    return;
  }

  try {
    const result = runScenario(request.settings);
    const response: ScenarioSuccess = { id: request.id, result };
    workerScope.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scenario error.';
    const response: ScenarioFailure = { id: request.id, error: message };
    workerScope.postMessage(response);
  }
});
