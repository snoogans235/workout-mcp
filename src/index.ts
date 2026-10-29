import { greet } from "./greet.js";
import { loadProjectEnv } from "./environment.js";

loadProjectEnv();
console.log(greet("Jonathan"));
