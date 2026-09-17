import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Regla R5 · Sin ranking público entre estudiantes", () => {
  it("ningún archivo en src/app o src/lib debe ordenar estudiantes por desempeño o puntaje", () => {
    const srcDir = path.resolve(__dirname, "../../src");
    
    function inspectDir(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(inspectDir(fullPath));
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const files = inspectDir(srcDir);
    const forbiddenPatterns = [
      /rankingEstudiantes/i,
      /tablaPosiciones/i,
      /mejoresEstudiantes/i,
      /peoresEstudiantes/i,
      /order\s*by\s+puntaje\s+(desc|asc)/i,
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(match, `Patrón prohibido ${pattern} hallado en ${filePath}`).toBeNull();
      }
    }
  });
});