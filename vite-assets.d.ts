declare module "*?url" {
  const url: string;
  export default url;
}
declare module "*?worker" {
  const WorkerClass: { new (): Worker };
  export default WorkerClass;
}
