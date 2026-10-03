import { createApp, serviceName } from './app.js';

const PORT = 3001;

createApp().listen(PORT, () => {
  console.log(`${serviceName} ouvindo na porta ${PORT}`);
});
