const assert = require("node:assert/strict");
const loadTsService = require("./load-ts-service.cjs");

const { isSkillReferenced, referencedSkillIds } = loadTsService("src/main/services/templateDependencies.ts");

const skills = [
  { id: "writer", name: "Khazix Writer", tags: ["article"] },
  { id: "poster", name: "公众号发布", tags: ["wechat"] },
  { id: "capture", name: "Skill-Space", tags: ["skillops"] }
];
const rootById = new Map([
  ["writer", "C:/skills/writer"],
  ["poster", "C:/skills/poster"],
  ["capture", "C:/skills/capture"]
]);

assert.equal(isSkillReferenced("Use khazix writer to draft.", skills[0]), true);
assert.equal(isSkillReferenced("Use unrelated wording.", skills[0]), false);
assert.deepEqual(
  referencedSkillIds("First call khazix writer, then 公众号发布.", skills, "capture", "C:/skills/capture", rootById).sort(),
  ["poster", "writer"]
);
assert.deepEqual(referencedSkillIds("Skill-Space should not include itself.", skills, "capture", "C:/skills/capture", rootById), []);

console.log("template dependency smoke test passed");
