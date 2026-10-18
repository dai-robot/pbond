declare module "node:sqlite" {
  interface StatementSync {
    run(...params: (string | number | null | undefined)[]): { changes: number };
    get(...params: (string | number | null | undefined)[]): unknown;
    all(...params: (string | number | null | undefined)[]): unknown[];
  }
  export class DatabaseSync {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
