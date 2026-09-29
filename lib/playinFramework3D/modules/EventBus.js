export class EventBus {
  constructor() {
    if (EventBus._instance) {
      return EventBus._instance;
    }

    EventBus._instance = this;
    this.events = {};
    // this.exampleEventFlow();

    return EventBus._instance;
  }

  // Subscribe to an event with optional invocationOrder
  on(event, listener, invocationOrder = 0) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push({ listener, invocationOrder });
    // Sort listeners by invocationOrder (lower invocationOrder first)
    this.events[event].sort((a, b) => a.invocationOrder - b.invocationOrder);
    console.log(`Listener added to event: ${event} with invocationOrder: ${invocationOrder}`);
  }

  // Unsubscribe from an event
  off(event, listenerToRemove) {
    if (!this.events[event]) return;

    this.events[event] = this.events[event].filter(({ listener }) => listener !== listenerToRemove);
    console.log(`Listener removed from event: ${event}`);
  }

  // Emit an event
  emit(event, ...args) {
    if (!this.events[event]) return;

    //console.log(`Emitting event: ${event}`);
    this.events[event].forEach(({ listener }) => {
      listener(...args);
    });
  }

  exampleEventFlow() {
    // Usage example with execution order
    function onFooHighInvocationOrder(data) {
      console.log(`High invocationOrder foo event received with data: ${data}`);
    }

    function onFooLowInvocationOrder(data) {
      console.log(`Low invocationOrder foo event received with data: ${data}`);
    }

    // 1. Subscribe to the 'foo' event with high invocationOrder
    console.log("Subscribing to foo event with high invocationOrder...");
    this.on("foo", onFooHighInvocationOrder, 10);

    // 2. Subscribe to the 'foo' event with low invocationOrder
    console.log("Subscribing to foo event with low invocationOrder...");
    this.on("foo", onFooLowInvocationOrder, 1);

    // 3. Emit the 'foo' event
    console.log("Emitting foo event...");
    this.emit("foo", "some data for foo");

    // 4. Unsubscribe from the 'foo' event (high invocationOrder)
    console.log("Unsubscribing from foo event (high invocationOrder)...");
    this.off("foo", onFooHighInvocationOrder);

    // 5. Emit the 'foo' event again
    console.log("Emitting foo event again...");
    this.emit("foo", "some data for foo");
  }
}
