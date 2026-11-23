// Titik masuk aplikasi: menghubungkan setiap tab dengan modulnya.

import { initTabs, initTooltips, openTab, registerTab } from "./common.js";
import { initSearch } from "./search.js";
import { initDataset, loadDataset } from "./dataset.js";
import { initExplain, runExplain } from "./explain.js";
import { initEvaluation, loadEvaluation } from "./evaluation.js";
import { initOverview, loadOverview } from "./overview.js";

registerTab("overview", loadOverview);
registerTab("dataset", loadDataset);
registerTab("explain", () => runExplain());
registerTab("evaluation", loadEvaluation);

initTabs();
initTooltips();
initSearch();
initDataset();
initExplain();
initEvaluation();
initOverview();

// Ringkasan adalah halaman pembuka
openTab("overview");
