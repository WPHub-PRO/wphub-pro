declare function ok(res: any, payload?: {}, statusCode?: number): any;
declare function fail(res: any, message: any, statusCode?: number, extra?: {}): any;
export { ok, fail };
