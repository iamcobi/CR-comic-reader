// Decode only the answer string. Partial JSON never becomes a task or team edit.
export function partialAnswer(json: string): string {
  const match = /"answer"\s*:\s*"/.exec(json);
  if (!match) return "";
  const value = json.slice(match.index + match[0].length);
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') break;
    if (char !== "\\") {
      result += char;
      continue;
    }
    if (i + 1 >= value.length) break;
    const escape = value[++i];
    if (escape === "u") {
      const digits = value.slice(i + 1, i + 5);
      if (!/^[0-9a-f]{4}$/i.test(digits)) break;
      result += String.fromCharCode(parseInt(digits, 16));
      i += 4;
    } else
      result +=
        (
          {
            n: "\n",
            r: "\r",
            t: "\t",
            b: "\b",
            f: "\f",
            '"': '"',
            "\\": "\\",
            "/": "/",
          } as Record<string, string>
        )[escape] ?? "";
  }
  return result;
}
