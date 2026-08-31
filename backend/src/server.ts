import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`LoadShift backend listening on http://localhost:${config.PORT}`);
});
