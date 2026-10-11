import { assertConfig, config } from "./config";
import { createApp } from "./app";

assertConfig();
const app = createApp();

app.listen(config.port, () => {
  console.log(`Rajshree API listening on http://localhost:${config.port}`);
});
