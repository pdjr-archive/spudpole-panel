class TankMonitor {

  /********************************************************************
   * The config object my include the following properties.
   *
   * config 
   *   Url referencing the JSON configuration file that should be used
   *   to configure the TankMonitor. Defaults to the relative url
   *   "config.json")
   * container
   *   The container within which the TankMonitor should be built. This
   *   can be an Element reference or a string containing an argument
   *   suitable for used with document.querySelector. Defaults to
   *   document.body. 
   */ 

  static create(config = {}) {
    config.config = (config.config)?config.config:"config.json";
    config.container = (config.container)?((typeof config.container == "string")?document.querySelector(config.container):config.container):document.body;

    try {
      var signalkClient = null

      if (window.parent.window.SignalkClient) {
        signalkClient = window.parent.window.SignalkClient;
      } else {
        signalkClient = new SignalkClient(window.location.hostname, window.location.port);
      }

      signalkClient.waitForConnection().then(
        () => {
          new SpudpolePanel(signalkClient, body); },
        },
        () => { throw "no connection to Signal K server"; }
      );
    } catch(e) {
      console.log("fatal error: %s", e);
    }
  }

  /********************************************************************
   * Create a new TankMonitor instance.
   * @param client - SignalkClient instance connected to the host
   * server.
   * @param container - HTML entity in which the TankMonitor structure
   * should be built. This can be an Element reference or a query
   * string that will select the root container.
   * @param options - a copy of the configuration object extracted from
   * the plugin configuration file.
   */

  constructor(client, container) {
    if (!client) throw "error connecting to Signal K server";
    this.signalkClient = client;
    this.spudpoles = new Set();
    this.popup = { container: null, image: null, navleft: null, navright: null, selection: [] };

    this.signalkClient.getEndpoints(endpoints => {
      endpoints.filter(endpoint => (endpoint.startsWith('tanks.'))).forEach(endpoint => {
        var tweak = this.tweak(endpoint, this.options.tweaks);
        if (!tweak.ignore) this.tanks.add(endpoint.substr(0, endpoint.lastIndexOf('.')));
      });
    });

    var tankChart = PageUtils.createElement('div', null, 'tank-chart flex-container', null, container);
    [...this.tanks].forEach(tank => tankChart.appendChild(this.makeTankBar(tank)));

    this.makePopup();
    container.appendChild(this.popup.container);

  }

  makeTankBar(tankpath) {
    var tweak = this.tweak(tankpath, this.options.tweaks);
    var tankBar = PageUtils.createElement('div', tankpath, 'tank-bar', null, null);
    tankBar.appendChild(this.makeTankCard(tankpath));
    tankBar.appendChild(this.makeTankGraph(tankpath));
    if (tweak.log) tankBar.addEventListener("click", (e) => {
      this.popup.selection = this.options.rrdtool.graph.graphs.map(v => this.options.rrdtool.graph.folder + v.filename);
      this.popup.image.src = this.popup.selection[0];
      this.popup.container.classList.remove('hidden');
    });
    return(tankBar);
  }

  makeTankCard(tankpath) {
    var tankCard = PageUtils.createElement('div', null, 'tank-card', null, null);
    var tweak = this.tweak(tankpath, this.options.tweaks);
    for (var i = 0; i < 10; i++) {
      var tankCardRegion = PageUtils.createElement('div', null, 'tank-card-region', null, tankCard);
      if ((i == 0) && (tweak.labels)) this.addLabelElements(tankCardRegion, tweak.labels);
      if (i == 9) this.addLegendElements(tankCardRegion, tankpath, tweak);
    }
    return(tankCard);
  }

  addLegendElements(container, tankpath, tweak) {
    let tankName = PageUtils.createElement('div', null, 'tankname', this.getMeaningfulName(tankpath, tweak), container);
    let tankData = PageUtils.createElement('div', null, 'tankdata', null, container);
    let tankLevel = PageUtils.createElement('span', null, 'tanklevel', null, tankData);
    tankData.appendChild(document.createTextNode(' / '));
    let tankCapacity = PageUtils.createElement('span', null, 'tankcapacity', null, tankData);
    this.signalkClient.getValue(tankpath + ".capacity", (v) => { tankCapacity.innerHTML = this.getAdjustedValue(v, tweak); });
    this.signalkClient.registerCallback(tankpath + ".currentLevel", (v) => { tankLevel.innerHTML = this.getAdjustedValue(v * (tankCapacity.innerHTML / ((tweak.factor === undefined)?1:tweak.factor)), tweak); });
  }

  addLabelElements(container, labeldefs) {
    container.classList.add('label');
    var label = undefined;
    labeldefs.reduce((a,labeldef) => {
      if (labeldef.content) {
        if (labeldef.content.includes(".svg")) {
          label = PageUtils.createElement('img', null, 'icon', labeldef.content, container);
        } else {
          label = PageUtils.createElement('span', null, 'text', labeldef.content, container);
        }
      }
      if ((label) && (labeldef.trigger)) {
        label.classList.add('alert', 'hidden');
        var triggerParts = labeldef.trigger.split(/:|<|>|\+|\-/);

        this.signalkClient.registerCallback(triggerParts[0], (v) => {
          if (this.triggerTest(labeldef.trigger, v)) {
            label.classList.remove('hidden');
          } else {
            label.classList.add('hidden');
          }
        });
      }
      a.appendChild(label);
      return(a);
    }, container); 
  }
   
  makeTankGraph(tankpath) {
    var tweak = this.tweak(tankpath, this.options.tweaks);
    let tankGraph = PageUtils.createElement('div', null, 'tank-graph', null, null);
    if (tweak.color) tankGraph.style.backgroundColor = tweak.color;
    let tankGraphPercent = PageUtils.createElement('div', null, 'tank-graph-percent', "---", tankGraph);
    this.signalkClient.registerCallback(tankpath + ".currentLevel", (v) => {
      var percent = "" + Math.floor((v + 0.005) * 100) + "%";
      tankGraph.style.height = percent;
      tankGraphPercent.innerHTML = percent;
      if (v < 0.12) { tankGraphPercent.classList.add('hidden'); } else { tankGraphPercent.classList.remove('hidden'); }
    });
    return(tankGraph);
  }

  makePopup() {
    this.popup.container = PageUtils.createElement('div', 'popup', 'hidden', null, null);
    this.popup.navleft = PageUtils.createElement('div', null, 'nav left', null, this.popup.container);
    this.popup.navright = PageUtils.createElement('div', null, 'nav right', null, this.popup.container);
    this.popup.image = PageUtils.createElement('img', null, 'image', null, PageUtils.createElement('div', null, null, null, this.popup.container));
    this.popup.image.addEventListener('click', (e) => this.popup.container.classList.add('hidden'));
    this.popup.navleft.addEventListener('click', (e) => {
      this.popup.selection.unshift(this.popup.selection.pop());
      this.popup.image.src = this.popup.selection[0];
    });
    this.popup.navright.addEventListener('click', (e) => {
      this.popup.selection.push(this.popup.selection.shift());
      this.popup.image.src = this.popup.selection[0];
    });
  }

  getTankNumber(path) {
    var parts = path.split('.');
    return((parts[2] !== undefined)?parts[2]:0);
  }

  getMeaningfulName(path, tweak) {
    var parts = path.split('.');
    return("Tank " + parts[2] + (" (" + ((tweak.name !== undefined)?tweak.name:parts[1]) + ")"));
  }

  getAdjustedValue(v, tweak) {
    return((v * ((tweak.factor === undefined)?1:tweak.factor)).toFixed(((tweak.places === undefined)?0:tweak.places)));
  }

  tweak(path, tweaks = []) { 
    var tweaks = tweaks.sort((a,b) => (a.path === undefined)?-1:((b.path === undefined)?+1:(a.path.length - b.path.length)));
    var retval = tweaks.reduce((a, v) => {
      if ((v.path === undefined) || path.startsWith(v.path)) {
        Object.keys(v).filter(k => (k != 'path')).forEach(k => { a[k] = v[k]; });
      }
      return(a);
    }, {});
    return(retval);
  }

  triggerTest(trigger, v) {
    var retval = false;
    var p;
    if (trigger.startsWith("notifications.")) {
      retval = v;
    } else if ((p = trigger.indexOf(':')) >= 0) {
      retval = (v.state == p.substring(p + 1));
    } else if ((p = trigger.indexOf('<')) >= 0) {
      retval = (v < trigger.substring(p + 1));
    } else if ((p = trigger.indexOf('>')) >= 0) {
      retval = (v > trigger.substring(p + 1));
    } else if ((p = trigger.indexOf('+')) >= 0) {
      var path = (trigger.substring(0, p) + ".incr");
      var incr = Number(trigger.substring(p + 1));
      if (this.values[path] === undefined) this.values[path] = [ 0 ];
      var mean = (this.values[path].reduce((a,v) => (a + v), 0) / this.values[path].length);
      if (this.values[path].length > 30) retval = (v > (mean + incr)); 
      this.values[path].push(v); if (this.values[path].length > 30) this.values[path].shift();
    } else if ((p = trigger.indexOf('-')) >= 0) {
      var path = (trigger.substring(0, p) + ".decr");
      var incr = Number(trigger.substring(p + 1));
      if (this.values[path] === undefined) this.values[path] = [ 0 ];
      var mean = (this.values[path].reduce((a,v) => (a + v), 0) / this.values[path].length);
      if (this.values[path].length > 30) retval = (v < (mean - incr)); 
      this.values[path].push(v); if (this.values[path].length > 30) this.values[path].shift();
    } else {
      retval =  v;
    }
    return(retval);
  }

}
