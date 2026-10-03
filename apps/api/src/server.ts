import { createApp, serviceName } from './app';

const PORT = 3001;

createApp().listen(PORT, () => {
  console.log(`${serviceName} ouvindo na porta ${PORT}`);
});
