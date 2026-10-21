import { assertConfig, config } from "./config";
import { createApp } from "./app";
import { clearAllNotifications } from "./lib/activity";

assertConfig();
const app = createApp();

app.listen(config.port, () => {
  console.log(`Rajshree API listening on http://localhost:${config.port}`);
  void clearAllNotifications()
    .then((deleted) => {
      if (deleted > 0) {
        console.log(`Cleared ${deleted} old notification(s)`);
      }
    })
    .catch((err) => {
      console.error("Failed to clear notifications", err);
    });
});
