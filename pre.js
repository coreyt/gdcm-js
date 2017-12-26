var __gdcmconv_utf8ToStr;

function __gdcmconv(__gdcmconv_opts) {
  __gdcmconv_utf8ToStr = UTF8ArrayToString;
  __gdcmconv_opts = __gdcmconv_opts || {};
  var __gdcmconv_return;
  var Module = {};

  function __gdcmconv_toU8(data) {
    if (Array.isArray(data) || data instanceof ArrayBuffer) {
      data = new Uint8Array(data);
    } else if (!data) {
      // `null` for empty files.
      data = new Uint8Array(0);
    } else if (!(data instanceof Uint8Array)) {
      // Avoid unnecessary copying.
      data = new Uint8Array(data.buffer);
    }
    return data;
  }

  Object.keys(__gdcmconv_opts).forEach(function(key) {
    if (key != "mounts" && key != "MEMFS") {
      Module[key] = __gdcmconv_opts[key];
    }
  });

  // XXX(Kagami): Prevent Emscripten to call `process.exit` at the end of
  // execution on Node.
  // There is no longer `NODE_STDOUT_FLUSH_WORKAROUND` and it seems to
  // be the best way to accomplish that.
  Module["preInit"] = function() {
    console.log("preInit");
    if (ENVIRONMENT_IS_NODE) {
      exit = Module["exit"] = function(status) {
        console.log("exit");
        ABORT = true;
        EXITSTATUS = status;
        STACKTOP = initialStackTop;
        exitRuntime();
        if (Module["onExit"]) Module["onExit"](status);
        throw new ExitStatus(status);
      };
    }
  };

  Module["preRun"] = function() {
    console.log("preRun");
    (__gdcmconv_opts["mounts"] || []).forEach(function(mount) {
      var fs = FS.filesystems[mount["type"]];
      if (!fs) {
        throw new Error("Bad mount type");
      }
      var mountpoint = mount["mountpoint"];
      // NOTE(Kagami): Subdirs are not allowed in the paths to simplify
      // things and avoid ".." escapes.
      if (!mountpoint.match(/^\/[^\/]+$/) ||
          mountpoint === "/." ||
          mountpoint === "/.." ||
          mountpoint === "/tmp" ||
          mountpoint === "/home" ||
          mountpoint === "/dev" ||
          mountpoint === "/work") {
        throw new Error("Bad mount point");
      }
      FS.mkdir(mountpoint);
      FS.mount(fs, mount["opts"], mountpoint);
    });

    FS.mkdir("/work");
    FS.chdir("/work");

    (__gdcmconv_opts["MEMFS"] || []).forEach(function(file) {
      if (file["name"].match(/\//)) {
        throw new Error("Bad file name");
      }
      var fd = FS.open(file["name"], "w+");
      var data = __gdcmconv_toU8(file["data"]);
      FS.write(fd, data, 0, data.length);
      FS.close(fd);
    });
  };

  Module["postRun"] = function() {
    console.log("postrun");
    // NOTE(Kagami): Search for files only in working directory, one
    // level depth. Since FFmpeg shouldn't normally create
    // subdirectories, it should be enough.
    function listFiles(dir) {
      var contents = FS.lookupPath(dir).node.contents;
      var filenames = Object.keys(contents);
      // Fix for possible file with "__proto__" name. See
      // <https://github.com/kripken/emscripten/issues/3663> for
      // details.
      if (contents.__proto__ && contents.__proto__.name === "__proto__") {
        filenames.push("__proto__");
      }
      return filenames.map(function(filename) {
        return contents[filename];
      });
    }

    var inFiles = Object.create(null);
    (__gdcmconv_opts["MEMFS"] || []).forEach(function(file) {
      inFiles[file.name] = null;
    });
    var outFiles = listFiles("/work").filter(function(file) {
      return !(file.name in inFiles);
    }).map(function(file) {
      var data = __gdcmconv_toU8(file.contents);
      return {"name": file.name, "data": data};
    });
    __gdcmconv_return = {"MEMFS": outFiles};
};