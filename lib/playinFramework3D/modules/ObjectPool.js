export class ObjectPool {
  constructor(createFunc, initialSize = 0) {
    this.createFunc = createFunc;
    this.pool = [];

    // Optionally pre-fill the pool with objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFunc());
    }
  }

  spawn() {
    // Retrieve an object from the pool or create a new one if the pool is empty
    return this.pool.length > 0 ? this.pool.shift() : this.createFunc();
  }

  deSpawn(object) {
    // Optionally reset the object to its initial state before returning it to the pool
    this.pool.push(object);
  }
}
