import { createApp, serviceName } from './app.js';
import { EnvError, loadEnv } from './env.js';

try {
  const env = loadEnv();
  createApp().listen(env.PORT, () => {
    console.log(`${serviceName} ouvindo na porta ${env.PORT}`);
  });
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
