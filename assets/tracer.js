var zoneIds = 0;
function nextZoneId() {
  return ++zoneIds;
}

/**
 * Replace window.zone with our stack trace enabled zone
 * This way, it's possible to trace all the way up
 */

window.zone = zone.fork({
  onError: function (e) {
    zone.erroredStack = new Stacktrace(e);
    Zone.Reporters.run(zone);
  },

  fork: function (locals) {
    var zone = this._fork(locals);
    zone.currentStack = getStacktrace();
    zone.createdAt = Date.now();
    zone.id = nextZoneId();

    // when creating a new zone, it will use's parent zone as __proto__
    // that's why we can access ancesstor properties
    // but we are deleting _eventMap just after zone ran
    // so, we need to create _eventMap explicitely to stay it in the current zone
    zone._eventMap = zone._eventMap;
    return zone;
  },

  beforeTask: function() {
    zone.runAt = Date.now();

    // create _eventMap for the first time
    // eventMap will be deleted just after zone completed
    // but it will be available only in the errroed zone
    // so, in that zone, someone can access all the events happened on the
    // async call stack
    if(!zone._eventMap) {
      zone._eventMap = {};
    }

    // _events will only be available during the zone running time only
    zone._events = [];
    zone._eventMap[zone.id] = zone._events;
  },

  afterTask: function() {
    delete zone._events;
    // we only keep _eventMap in the errored zone only
    if(!zone.erroredStack) {
      delete this._eventMap;
    }
  },

  addEvent: function(event) {
    // when zone completed _events will be removed
    // but actions may happen even after the zone completed
    // and we are not interested about those
    if(zone._events) {
      zone._events.push(event);
    }
  },

  _fork: zone.fork
});

/**
 * Create a stack trace
 */

function getStacktrace () {
  var stack = getStacktraceWithUncaughtError();
  if (stack && stack._e.stack) {
    getStacktrace = getStacktraceWithUncaughtError;
    return stack;
  } else {
    getStacktrace = getStacktraceWithCaughtError;
    return getStacktrace();
  }
};

function getStacktraceWithUncaughtError () {
  return new Stacktrace(new Error());
}

function getStacktraceWithCaughtError () {
  try {
    throw new Error();
  } catch (e) {
    return new Stacktrace(e);
  }
}

/*
 * Wrapped stacktrace
 *
 * We need this because in some implementations, constructing a trace is slow
 * and so we want to defer accessing the trace for as long as possible
 */

function Stacktrace (e) {
  this._e = e;
}

Stacktrace.prototype.get = function() {
  return this._e.stack
    .split('\n')
    .filter(this.stackFramesFilter)
    .join('\n');
};

Stacktrace.prototype.stackFramesFilter = function(line) {
  var filterRegExp = /\/packages\/zones\/assets\/|^Error$/;
  return !line.match(filterRegExp);
};
