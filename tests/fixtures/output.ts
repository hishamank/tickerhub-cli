import { installCliOutputRouting } from "../../src/output.js";
installCliOutputRouting();
const notice = "Please consider completing the survey at https://bit.ly/yahoo-finance-api-feedback";
console.log(notice);
console.warn(Buffer.from(notice));
console.info("diagnostic");
process.stdout.write(JSON.stringify({ notice }) + "\n", () => {
  process.stdout.write(Buffer.from("callback\n"), () => console.error("buffer callback"));
});
