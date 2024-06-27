import { __decorate } from 'tslib';
// rename transition due to conflict with d3 transition
import { animate, style, transition as ngTransition, trigger } from '@angular/animations';
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChildren,
  ViewEncapsulation
} from '@angular/core';
import { select } from 'd3-selection';
import * as shape from 'd3-shape';
import * as ease from 'd3-ease';
import 'd3-transition';
import { Observable, Subscription, of, fromEvent as observableFromEvent, Subject } from 'rxjs';
import { first, debounceTime, takeUntil } from 'rxjs/operators';
import { identity, scale, smoothMatrix, toSVG, transform, translate } from 'transformation-matrix';
import { id } from '../utils/id';
import { PanningAxis } from '../enums/panning.enum';
import { MiniMapPosition } from '../enums/mini-map-position.enum';
import { throttleable } from '../utils/throttle';
import { ColorHelper } from '../utils/color.helper';
import { calculateViewDimensions } from '../utils/view-dimensions.helper';
import { VisibilityObserver } from '../utils/visibility-observer';
import * as i0 from '@angular/core';
import * as i1 from './layouts/layout.service';
import * as i2 from './mouse-wheel.directive';
import * as i3 from '@angular/common';
export var NgxGraphStates;
(function (NgxGraphStates) {
  NgxGraphStates['Init'] = 'init';
  NgxGraphStates['Subscribe'] = 'subscribe';
  NgxGraphStates['Transform'] = 'transform';
})(NgxGraphStates || (NgxGraphStates = {}));
export class GraphComponent {
  constructor(el, zone, cd, layoutService) {
    this.el = el;
    this.zone = zone;
    this.cd = cd;
    this.layoutService = layoutService;
    this.nodes = [];
    this.clusters = [];
    this.compoundNodes = [];
    this.links = [];
    this.activeEntries = [];
    this.draggingEnabled = true;
    this.panningEnabled = true;
    this.panningAxis = PanningAxis.Both;
    this.enableZoom = true;
    this.zoomSpeed = 0.1;
    this.minZoomLevel = 0.1;
    this.maxZoomLevel = 4.0;
    this.autoZoom = false;
    this.panOnZoom = true;
    this.animate = false;
    this.autoCenter = false;
    this.enableTrackpadSupport = false;
    this.showMiniMap = false;
    this.miniMapMaxWidth = 100;
    this.miniMapPosition = MiniMapPosition.UpperRight;
    this.scheme = 'cool';
    this.animations = true;
    this.deferDisplayUntilPosition = false;
    this.centerNodesOnPositionChange = true;
    this.enablePreUpdateTransform = true;
    this.select = new EventEmitter();
    this.activate = new EventEmitter();
    this.deactivate = new EventEmitter();
    this.zoomChange = new EventEmitter();
    this.clickHandler = new EventEmitter();
    this.stateChange = new EventEmitter();
    this.isMouseMoveCalled = false;
    this.graphSubscription = new Subscription();
    this.isPanning = false;
    this.isDragging = false;
    this.initialized = false;
    this.graphDims = { width: 0, height: 0 };
    this._oldLinks = [];
    this.oldNodes = new Set();
    this.oldClusters = new Set();
    this.oldCompoundNodes = new Set();
    this.transformationMatrix = identity();
    this._touchLastX = null;
    this._touchLastY = null;
    this.minimapScaleCoefficient = 3;
    this.minimapOffsetX = 0;
    this.minimapOffsetY = 0;
    this.isMinimapPanning = false;
    this.destroy$ = new Subject();
    this.groupResultsBy = node => node.label;
    this.updateCount = 0;
  }
  /**
   * Get the current zoom level
   */
  get zoomLevel() {
    return this.transformationMatrix.a;
  }
  /**
   * Set the current zoom level
   */
  set zoomLevel(level) {
    this.zoomTo(Number(level));
  }
  /**
   * Get the current `x` position of the graph
   */
  get panOffsetX() {
    return this.transformationMatrix.e;
  }
  /**
   * Set the current `x` position of the graph
   */
  set panOffsetX(x) {
    this.panTo(Number(x), null);
  }
  /**
   * Get the current `y` position of the graph
   */
  get panOffsetY() {
    return this.transformationMatrix.f;
  }
  /**
   * Set the current `y` position of the graph
   */
  set panOffsetY(y) {
    this.panTo(null, Number(y));
  }
  /**
   * Angular lifecycle event
   *
   *
   * @memberOf GraphComponent
   */
  ngOnInit() {
    if (this.update$) {
      this.update$.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.update();
      });
    }
    if (this.center$) {
      this.center$.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.center();
      });
    }
    if (this.zoomToFit$) {
      this.zoomToFit$.pipe(takeUntil(this.destroy$)).subscribe(options => {
        this.zoomToFit(options ? options : {});
      });
    }
    if (this.panToNode$) {
      this.panToNode$.pipe(takeUntil(this.destroy$)).subscribe(nodeId => {
        this.panToNodeId(nodeId);
      });
    }
    this.minimapClipPathId = `minimapClip${id()}`;
    this.stateChange.emit({ state: NgxGraphStates.Subscribe });
  }
  ngOnChanges(changes) {
    this.basicUpdate();
    const { layout, layoutSettings, nodes, clusters, links, compoundNodes } = changes;
    this.setLayout(this.layout);
    if (layoutSettings) {
      this.setLayoutSettings(this.layoutSettings);
    }
    this.update();
  }
  setLayout(layout) {
    this.initialized = false;
    if (!layout) {
      layout = 'dagre';
    }
    if (typeof layout === 'string') {
      this.layout = this.layoutService.getLayout(layout);
      this.setLayoutSettings(this.layoutSettings);
    }
  }
  setLayoutSettings(settings) {
    if (this.layout && typeof this.layout !== 'string') {
      this.layout.settings = settings;
    }
  }
  /**
   * Angular lifecycle event
   *
   *
   * @memberOf GraphComponent
   */
  ngOnDestroy() {
    this.unbindEvents();
    if (this.visibilityObserver) {
      this.visibilityObserver.visible.unsubscribe();
      this.visibilityObserver.destroy();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
  /**
   * Angular lifecycle event
   *
   *
   * @memberOf GraphComponent
   */
  ngAfterViewInit() {
    this.bindWindowResizeEvent();
    // listen for visibility of the element for hidden by default scenario
    this.visibilityObserver = new VisibilityObserver(this.el, this.zone);
    this.visibilityObserver.visible.subscribe(this.update.bind(this));
    setTimeout(() => this.update());
  }
  /**
   * Base class update implementation for the dag graph
   *
   * @memberOf GraphComponent
   */
  update() {
    this.basicUpdate();
    if (!this.curve) {
      this.curve = shape.curveBundle.beta(1);
    }
    this.zone.run(() => {
      this.dims = calculateViewDimensions({
        width: this.width,
        height: this.height
      });
      this.seriesDomain = this.getSeriesDomain();
      this.setColors();
      this.createGraph();
      this.updateTransform();
      if (!this.initialized) {
        this.stateChange.emit({ state: NgxGraphStates.Init });
      }
      this.initialized = true;
    });
    this.updateCount++;
  }
  /**
   * Creates the dagre graph engine
   *
   * @memberOf GraphComponent
   */
  createGraph() {
    this.graphSubscription.unsubscribe();
    this.graphSubscription = new Subscription();
    const initializeNode = n => {
      if (!n.meta) {
        n.meta = {};
      }
      if (!n.id) {
        n.id = id();
      }
      if (!n.dimension) {
        n.dimension = {
          width: this.nodeWidth ? this.nodeWidth : 30,
          height: this.nodeHeight ? this.nodeHeight : 30
        };
        n.meta.forceDimensions = false;
      } else {
        n.meta.forceDimensions = n.meta.forceDimensions === undefined ? true : n.meta.forceDimensions;
      }
      if (!n.position) {
        n.position = {
          x: 0,
          y: 0
        };
        if (this.deferDisplayUntilPosition) {
          n.hidden = true;
        }
      }
      if (this.updateCount == 0 && n.data?.data?.position) {
        const p = n.data?.data?.position;
        console.log('setting up position for first time: ', p);
        n.position = { x: p.x, y: p.y };
      }
      n.data = n.data ? n.data : {};
      return n;
    };
    this.graph = {
      nodes: this.nodes.length > 0 ? [...this.nodes].map(initializeNode) : [],
      clusters: this.clusters && this.clusters.length > 0 ? [...this.clusters].map(initializeNode) : [],
      compoundNodes:
        this.compoundNodes && this.compoundNodes.length > 0 ? [...this.compoundNodes].map(initializeNode) : [],
      edges:
        this.links.length > 0
          ? [...this.links].map(e => {
              if (!e.id) {
                e.id = id();
              }
              return e;
            })
          : []
    };
    requestAnimationFrame(() => this.draw());
  }
  /**
   * Draws the graph using dagre layouts
   *
   *
   * @memberOf GraphComponent
   */
  draw() {
    if (!this.layout || typeof this.layout === 'string') {
      return;
    }
    // Calc view dims for the nodes
    this.applyNodeDimensions();
    // Recalc the layout
    const result = this.layout.run(this.graph);
    const result$ = result instanceof Observable ? result : of(result);
    this.graphSubscription.add(
      result$.subscribe(graph => {
        this.graph = graph;
        this.tick();
      })
    );
    if (this.graph.nodes.length === 0 && this.graph.compoundNodes?.length === 0) {
      return;
    }
    result$.pipe(first()).subscribe(() => this.applyNodeDimensions());
  }
  tick() {
    // Transposes view options to the node
    const oldNodes = new Set();
    this.graph.nodes.map(n => {
      n.transform = `translate(${n.position.x - (this.centerNodesOnPositionChange ? n.dimension.width / 2 : 0) || 0}, ${
        n.position.y - (this.centerNodesOnPositionChange ? n.dimension.height / 2 : 0) || 0
      })`;
      if (!n.data) {
        n.data = {};
      }
      n.data.color = this.colors.getColor(this.groupResultsBy(n));
      if (this.deferDisplayUntilPosition) {
        n.hidden = false;
      }
      oldNodes.add(n.id);
    });
    const oldClusters = new Set();
    const oldCompoundNodes = new Set();
    (this.graph.clusters || []).map(n => {
      n.transform = `translate(${n.position.x - (this.centerNodesOnPositionChange ? n.dimension.width / 2 : 0) || 0}, ${
        n.position.y - (this.centerNodesOnPositionChange ? n.dimension.height / 2 : 0) || 0
      })`;
      if (!n.data) {
        n.data = {};
      }
      n.data.color = this.colors.getColor(this.groupResultsBy(n));
      if (this.deferDisplayUntilPosition) {
        n.hidden = false;
      }
      oldClusters.add(n.id);
    });
    (this.graph.compoundNodes || []).map(n => {
      n.transform = `translate(${n.position.x - (this.centerNodesOnPositionChange ? n.dimension.width / 2 : 0) || 0}, ${
        n.position.y - (this.centerNodesOnPositionChange ? n.dimension.height / 2 : 0) || 0
      })`;
      if (!n.data) {
        n.data = {};
      }
      n.data.color = this.colors.getColor(this.groupResultsBy(n));
      if (this.deferDisplayUntilPosition) {
        n.hidden = false;
      }
      oldCompoundNodes.add(n.id);
    });
    // Prevent animations on new nodes
    setTimeout(() => {
      this.oldNodes = oldNodes;
      this.oldClusters = oldClusters;
      this.oldCompoundNodes = oldCompoundNodes;
    }, 500);
    // Update the labels to the new positions
    const newLinks = [];
    for (const edgeLabelId in this.graph.edgeLabels) {
      const edgeLabel = this.graph.edgeLabels[edgeLabelId];
      const normKey = edgeLabelId.replace(/[^\w-]*/g, '');
      const isMultigraph =
        this.layout && typeof this.layout !== 'string' && this.layout.settings && this.layout.settings.multigraph;
      let oldLink = isMultigraph
        ? this._oldLinks.find(ol => `${ol.source}${ol.target}${ol.id}` === normKey)
        : this._oldLinks.find(ol => `${ol.source}${ol.target}` === normKey);
      const linkFromGraph = isMultigraph
        ? this.graph.edges.find(nl => `${nl.source}${nl.target}${nl.id}` === normKey)
        : this.graph.edges.find(nl => `${nl.source}${nl.target}` === normKey);
      if (!oldLink) {
        oldLink = linkFromGraph || edgeLabel;
      } else if (
        oldLink.data &&
        linkFromGraph &&
        linkFromGraph.data &&
        JSON.stringify(oldLink.data) !== JSON.stringify(linkFromGraph.data)
      ) {
        // Compare old link to new link and replace if not equal
        oldLink.data = linkFromGraph.data;
      }
      oldLink.oldLine = oldLink.line;
      const points = edgeLabel.points;
      const line = this.generateLine(points);
      const newLink = Object.assign({}, oldLink);
      newLink.line = line;
      newLink.points = points;
      this.updateMidpointOnEdge(newLink, points);
      const textPos = points[Math.floor(points.length / 2)];
      if (textPos) {
        newLink.textTransform = `translate(${textPos.x || 0},${textPos.y || 0})`;
      }
      newLink.textAngle = 0;
      if (!newLink.oldLine) {
        newLink.oldLine = newLink.line;
      }
      this.calcDominantBaseline(newLink);
      newLinks.push(newLink);
    }
    this.graph.edges = newLinks;
    // Map the old links for animations
    if (this.graph.edges) {
      this._oldLinks = this.graph.edges.map(l => {
        const newL = Object.assign({}, l);
        newL.oldLine = l.line;
        return newL;
      });
    }
    this.updateMinimap();
    if (this.autoZoom) {
      this.zoomToFit();
    }
    if (this.autoCenter) {
      // Auto-center when rendering
      this.center();
    }
    requestAnimationFrame(() => this.redrawLines());
    this.cd.markForCheck();
  }
  getMinimapTransform() {
    switch (this.miniMapPosition) {
      case MiniMapPosition.UpperLeft: {
        return '';
      }
      case MiniMapPosition.UpperRight: {
        return 'translate(' + (this.dims.width - this.graphDims.width / this.minimapScaleCoefficient) + ',' + 0 + ')';
      }
      default: {
        return '';
      }
    }
  }
  updateGraphDims() {
    let minX = +Infinity;
    let maxX = -Infinity;
    let minY = +Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.graph.nodes.length; i++) {
      const node = this.graph.nodes[i];
      minX = node.position.x < minX ? node.position.x : minX;
      minY = node.position.y < minY ? node.position.y : minY;
      maxX = node.position.x + node.dimension.width > maxX ? node.position.x + node.dimension.width : maxX;
      maxY = node.position.y + node.dimension.height > maxY ? node.position.y + node.dimension.height : maxY;
    }
    minX -= 100;
    minY -= 100;
    maxX += 100;
    maxY += 100;
    this.graphDims.width = maxX - minX;
    this.graphDims.height = maxY - minY;
    this.minimapOffsetX = minX;
    this.minimapOffsetY = minY;
  }
  updateMinimap() {
    // Calculate the height/width total, but only if we have any nodes
    if (this.graph.nodes && this.graph.nodes.length) {
      this.updateGraphDims();
      if (this.miniMapMaxWidth) {
        this.minimapScaleCoefficient = this.graphDims.width / this.miniMapMaxWidth;
      }
      if (this.miniMapMaxHeight) {
        this.minimapScaleCoefficient = Math.max(
          this.minimapScaleCoefficient,
          this.graphDims.height / this.miniMapMaxHeight
        );
      }
      this.minimapTransform = this.getMinimapTransform();
    }
  }
  /**
   * Measures the node element and applies the dimensions
   *
   * @memberOf GraphComponent
   */
  applyNodeDimensions() {
    if (this.nodeElements && this.nodeElements.length) {
      this.nodeElements.map(elem => {
        const nativeElement = elem.nativeElement;
        const node = this.graph.nodes.find(n => n.id === nativeElement.id);
        if (!node) {
          return;
        }
        // calculate the height
        let dims;
        try {
          dims = nativeElement.getBBox();
          if (!dims.width || !dims.height) {
            return;
          }
        } catch (ex) {
          // Skip drawing if element is not displayed - Firefox would throw an error here
          return;
        }
        if (this.nodeHeight) {
          node.dimension.height =
            node.dimension.height && node.meta.forceDimensions ? node.dimension.height : this.nodeHeight;
        } else {
          node.dimension.height =
            node.dimension.height && node.meta.forceDimensions ? node.dimension.height : dims.height;
        }
        if (this.nodeMaxHeight) {
          node.dimension.height = Math.max(node.dimension.height, this.nodeMaxHeight);
        }
        if (this.nodeMinHeight) {
          node.dimension.height = Math.min(node.dimension.height, this.nodeMinHeight);
        }
        if (this.nodeWidth) {
          node.dimension.width =
            node.dimension.width && node.meta.forceDimensions ? node.dimension.width : this.nodeWidth;
        } else {
          // calculate the width
          if (nativeElement.getElementsByTagName('text').length) {
            let maxTextDims;
            try {
              for (const textElem of nativeElement.getElementsByTagName('text')) {
                const currentBBox = textElem.getBBox();
                if (!maxTextDims) {
                  maxTextDims = currentBBox;
                } else {
                  if (currentBBox.width > maxTextDims.width) {
                    maxTextDims.width = currentBBox.width;
                  }
                  if (currentBBox.height > maxTextDims.height) {
                    maxTextDims.height = currentBBox.height;
                  }
                }
              }
            } catch (ex) {
              // Skip drawing if element is not displayed - Firefox would throw an error here
              return;
            }
            node.dimension.width =
              node.dimension.width && node.meta.forceDimensions ? node.dimension.width : maxTextDims.width + 20;
          } else {
            node.dimension.width =
              node.dimension.width && node.meta.forceDimensions ? node.dimension.width : dims.width;
          }
        }
        if (this.nodeMaxWidth) {
          node.dimension.width = Math.max(node.dimension.width, this.nodeMaxWidth);
        }
        if (this.nodeMinWidth) {
          node.dimension.width = Math.min(node.dimension.width, this.nodeMinWidth);
        }
      });
    }
  }
  /**
   * Redraws the lines when dragged or viewport updated
   *
   * @memberOf GraphComponent
   */
  redrawLines(_animate = this.animate) {
    this.linkElements.map(linkEl => {
      const edge = this.graph.edges.find(lin => lin.id === linkEl.nativeElement.id);
      if (edge) {
        const linkSelection = select(linkEl.nativeElement).select('.line');
        linkSelection
          .attr('d', edge.oldLine)
          .transition()
          .ease(ease.easeSinInOut)
          .duration(_animate ? 500 : 0)
          .attr('d', edge.line);
        const textPathSelection = select(this.el.nativeElement).select(`#${edge.id}`);
        textPathSelection
          .attr('d', edge.oldTextPath)
          .transition()
          .ease(ease.easeSinInOut)
          .duration(_animate ? 500 : 0)
          .attr('d', edge.textPath);
        this.updateMidpointOnEdge(edge, edge.points);
      }
    });
  }
  /**
   * Calculate the text directions / flipping
   *
   * @memberOf GraphComponent
   */
  calcDominantBaseline(link) {
    const firstPoint = link.points[0];
    const lastPoint = link.points[link.points.length - 1];
    link.oldTextPath = link.textPath;
    if (lastPoint.x < firstPoint.x) {
      link.dominantBaseline = 'text-before-edge';
      // reverse text path for when its flipped upside down
      link.textPath = this.generateLine([...link.points].reverse());
    } else {
      link.dominantBaseline = 'text-after-edge';
      link.textPath = link.line;
    }
  }
  /**
   * Generate the new line path
   *
   * @memberOf GraphComponent
   */
  generateLine(points) {
    const lineFunction = shape
      .line()
      .x(d => d.x)
      .y(d => d.y)
      .curve(this.curve);
    return lineFunction(points);
  }
  /**
   * Zoom was invoked from event
   *
   * @memberOf GraphComponent
   */
  onZoom($event, direction) {
    if (this.enableTrackpadSupport && !$event.ctrlKey) {
      this.pan($event.deltaX * -1, $event.deltaY * -1);
      return;
    }
    const zoomFactor = 1 + (direction === 'in' ? this.zoomSpeed : -this.zoomSpeed);
    // Check that zooming wouldn't put us out of bounds
    const newZoomLevel = this.zoomLevel * zoomFactor;
    if (newZoomLevel <= this.minZoomLevel || newZoomLevel >= this.maxZoomLevel) {
      return;
    }
    // Check if zooming is enabled or not
    if (!this.enableZoom) {
      return;
    }
    if (this.panOnZoom === true && $event) {
      // Absolute mouse X/Y on the screen
      const mouseX = $event.clientX;
      const mouseY = $event.clientY;
      // Transform the mouse X/Y into a SVG X/Y
      const svg = this.el.nativeElement.querySelector('svg');
      const svgGroup = svg.querySelector('g.chart');
      const point = svg.createSVGPoint();
      point.x = mouseX;
      point.y = mouseY;
      const svgPoint = point.matrixTransform(svgGroup.getScreenCTM().inverse());
      // Panzoom
      this.pan(svgPoint.x, svgPoint.y, true);
      this.zoom(zoomFactor);
      this.pan(-svgPoint.x, -svgPoint.y, true);
    } else {
      this.zoom(zoomFactor);
    }
  }
  /**
   * Pan by x/y
   *
   * @param x
   * @param y
   */
  pan(x, y, ignoreZoomLevel = false) {
    const zoomLevel = ignoreZoomLevel ? 1 : this.zoomLevel;
    this.transformationMatrix = transform(this.transformationMatrix, translate(x / zoomLevel, y / zoomLevel));
    this.updateTransform();
  }
  /**
   * Pan to a fixed x/y
   *
   */
  panTo(x, y) {
    if (x === null || x === undefined || isNaN(x) || y === null || y === undefined || isNaN(y)) {
      return;
    }
    const panX = -this.panOffsetX - x * this.zoomLevel + this.dims.width / 2;
    const panY = -this.panOffsetY - y * this.zoomLevel + this.dims.height / 2;
    this.transformationMatrix = transform(
      this.transformationMatrix,
      translate(panX / this.zoomLevel, panY / this.zoomLevel)
    );
    this.updateTransform();
  }
  /**
   * Zoom by a factor
   *
   */
  zoom(factor) {
    this.transformationMatrix = transform(this.transformationMatrix, scale(factor, factor));
    this.zoomChange.emit(this.zoomLevel);
    this.updateTransform();
  }
  /**
   * Zoom to a fixed level
   *
   */
  zoomTo(level) {
    this.transformationMatrix.a = isNaN(level) ? this.transformationMatrix.a : Number(level);
    this.transformationMatrix.d = isNaN(level) ? this.transformationMatrix.d : Number(level);
    this.zoomChange.emit(this.zoomLevel);
    if (this.enablePreUpdateTransform) {
      this.updateTransform();
    }
    this.update();
  }
  /**
   * Drag was invoked from an event
   *
   * @memberOf GraphComponent
   */
  onDrag(event) {
    if (!this.draggingEnabled) {
      return;
    }
    const node = this.draggingNode;
    if (this.layout && typeof this.layout !== 'string' && this.layout.onDrag) {
      this.layout.onDrag(node, event);
    }
    node.position.x += event.movementX / this.zoomLevel;
    node.position.y += event.movementY / this.zoomLevel;
    // move the node
    const x = node.position.x - (this.centerNodesOnPositionChange ? node.dimension.width / 2 : 0);
    const y = node.position.y - (this.centerNodesOnPositionChange ? node.dimension.height / 2 : 0);
    node.transform = `translate(${x}, ${y})`;
    for (const link of this.graph.edges) {
      if (
        link.target === node.id ||
        link.source === node.id ||
        link.target.id === node.id ||
        link.source.id === node.id
      ) {
        if (this.layout && typeof this.layout !== 'string') {
          const result = this.layout.updateEdge(this.graph, link);
          const result$ = result instanceof Observable ? result : of(result);
          this.graphSubscription.add(
            result$.subscribe(graph => {
              this.graph = graph;
              this.redrawEdge(link);
            })
          );
        }
      }
    }
    this.redrawLines(false);
    this.updateMinimap();
  }
  redrawEdge(edge) {
    const line = this.generateLine(edge.points);
    this.calcDominantBaseline(edge);
    edge.oldLine = edge.line;
    edge.line = line;
  }
  /**
   * Update the entire view for the new pan position
   *
   *
   * @memberOf GraphComponent
   */
  updateTransform() {
    this.transform = toSVG(smoothMatrix(this.transformationMatrix, 100));
    this.stateChange.emit({ state: NgxGraphStates.Transform });
  }
  /**
   * Node was clicked
   *
   *
   * @memberOf GraphComponent
   */
  onClick(event) {
    this.select.emit(event);
  }
  /**
   * Node was focused
   *
   *
   * @memberOf GraphComponent
   */
  onActivate(event) {
    if (this.activeEntries.indexOf(event) > -1) {
      return;
    }
    this.activeEntries = [event, ...this.activeEntries];
    this.activate.emit({ value: event, entries: this.activeEntries });
  }
  /**
   * Node was defocused
   *
   * @memberOf GraphComponent
   */
  onDeactivate(event) {
    const idx = this.activeEntries.indexOf(event);
    this.activeEntries.splice(idx, 1);
    this.activeEntries = [...this.activeEntries];
    this.deactivate.emit({ value: event, entries: this.activeEntries });
  }
  /**
   * Get the domain series for the nodes
   *
   * @memberOf GraphComponent
   */
  getSeriesDomain() {
    return this.nodes
      .map(d => this.groupResultsBy(d))
      .reduce((nodes, node) => (nodes.indexOf(node) !== -1 ? nodes : nodes.concat([node])), [])
      .sort();
  }
  /**
   * Tracking for the link
   *
   *
   * @memberOf GraphComponent
   */
  trackLinkBy(index, link) {
    return link.id;
  }
  /**
   * Tracking for the node
   *
   *
   * @memberOf GraphComponent
   */
  trackNodeBy(index, node) {
    return node.id;
  }
  /**
   * Sets the colors the nodes
   *
   *
   * @memberOf GraphComponent
   */
  setColors() {
    this.colors = new ColorHelper(this.scheme, this.seriesDomain, this.customColors);
  }
  /**
   * On mouse move event, used for panning and dragging.
   *
   * @memberOf GraphComponent
   */
  onMouseMove($event) {
    this.isMouseMoveCalled = true;
    if ((this.isPanning || this.isMinimapPanning) && this.panningEnabled) {
      this.panWithConstraints(this.panningAxis, $event);
    } else if (this.isDragging && this.draggingEnabled) {
      this.onDrag($event);
    }
  }
  onMouseDown(event) {
    this.isMouseMoveCalled = false;
  }
  graphClick(event) {
    if (!this.isMouseMoveCalled) this.clickHandler.emit(event);
  }
  /**
   * On touch start event to enable panning.
   *
   * @memberOf GraphComponent
   */
  onTouchStart(event) {
    this._touchLastX = event.changedTouches[0].clientX;
    this._touchLastY = event.changedTouches[0].clientY;
    this.isPanning = true;
  }
  /**
   * On touch move event, used for panning.
   *
   */
  onTouchMove($event) {
    if (this.isPanning && this.panningEnabled) {
      const clientX = $event.changedTouches[0].clientX;
      const clientY = $event.changedTouches[0].clientY;
      const movementX = clientX - this._touchLastX;
      const movementY = clientY - this._touchLastY;
      this._touchLastX = clientX;
      this._touchLastY = clientY;
      this.pan(movementX, movementY);
    }
  }
  /**
   * On touch end event to disable panning.
   *
   * @memberOf GraphComponent
   */
  onTouchEnd(event) {
    this.isPanning = false;
  }
  /**
   * On mouse up event to disable panning/dragging.
   *
   * @memberOf GraphComponent
   */
  onMouseUp(event) {
    this.isDragging = false;
    this.isPanning = false;
    this.isMinimapPanning = false;
    if (this.layout && typeof this.layout !== 'string' && this.layout.onDragEnd) {
      this.layout.onDragEnd(this.draggingNode, event);
    }
  }
  /**
   * On node mouse down to kick off dragging
   *
   * @memberOf GraphComponent
   */
  onNodeMouseDown(event, node) {
    if (!this.draggingEnabled) {
      return;
    }
    this.isDragging = true;
    this.draggingNode = node;
    if (this.layout && typeof this.layout !== 'string' && this.layout.onDragStart) {
      this.layout.onDragStart(node, event);
    }
  }
  /**
   * On minimap drag mouse down to kick off minimap panning
   *
   * @memberOf GraphComponent
   */
  onMinimapDragMouseDown() {
    this.isMinimapPanning = true;
  }
  /**
   * On minimap pan event. Pans the graph to the clicked position
   *
   * @memberOf GraphComponent
   */
  onMinimapPanTo(event) {
    const x =
      event.offsetX - (this.dims.width - (this.graphDims.width + this.minimapOffsetX) / this.minimapScaleCoefficient);
    const y = event.offsetY + this.minimapOffsetY / this.minimapScaleCoefficient;
    this.panTo(x * this.minimapScaleCoefficient, y * this.minimapScaleCoefficient);
    this.isMinimapPanning = true;
  }
  /**
   * Center the graph in the viewport
   */
  center() {
    this.panTo(this.graphDims.width / 2, this.graphDims.height / 2);
  }
  /**
   * Zooms to fit the entire graph
   */
  zoomToFit(zoomOptions) {
    this.updateGraphDims();
    const heightZoom = this.dims.height / this.graphDims.height;
    const widthZoom = this.dims.width / this.graphDims.width;
    let zoomLevel = Math.min(heightZoom, widthZoom, 1);
    if (zoomLevel < this.minZoomLevel) {
      zoomLevel = this.minZoomLevel;
    }
    if (zoomLevel > this.maxZoomLevel) {
      zoomLevel = this.maxZoomLevel;
    }
    if (zoomOptions?.force === true || zoomLevel !== this.zoomLevel) {
      this.zoomLevel = zoomLevel;
      if (zoomOptions?.autoCenter !== true) {
        this.updateTransform();
      }
      if (zoomOptions?.autoCenter === true) {
        this.center();
      }
      this.zoomChange.emit(this.zoomLevel);
    }
  }
  /**
   * Pans to the node
   * @param nodeId
   */
  panToNodeId(nodeId) {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (!node) {
      return;
    }
    this.panTo(node.position.x, node.position.y);
  }
  getCompoundNodeChildren(ids) {
    return this.nodes.filter(node => ids.includes(node.id));
  }
  panWithConstraints(key, event) {
    let x = event.movementX;
    let y = event.movementY;
    if (this.isMinimapPanning) {
      x = -this.minimapScaleCoefficient * x * this.zoomLevel;
      y = -this.minimapScaleCoefficient * y * this.zoomLevel;
    }
    switch (key) {
      case PanningAxis.Horizontal:
        this.pan(x, 0);
        break;
      case PanningAxis.Vertical:
        this.pan(0, y);
        break;
      default:
        this.pan(x, y);
        break;
    }
  }
  updateMidpointOnEdge(edge, points) {
    if (!edge || !points) {
      return;
    }
    if (points.length % 2 === 1) {
      edge.midPoint = points[Math.floor(points.length / 2)];
    } else {
      // Checking if the current layout is Elk
      if (this.layout?.settings?.properties?.['elk.direction']) {
        this._calcMidPointElk(edge, points);
      } else {
        const _first = points[points.length / 2];
        const _second = points[points.length / 2 - 1];
        edge.midPoint = {
          x: (_first.x + _second.x) / 2,
          y: (_first.y + _second.y) / 2
        };
      }
    }
  }
  _calcMidPointElk(edge, points) {
    let _firstX = null;
    let _secondX = null;
    let _firstY = null;
    let _secondY = null;
    const orientation = this.layout.settings?.properties['elk.direction'];
    const hasBend =
      orientation === 'RIGHT' ? points.some(p => p.y !== points[0].y) : points.some(p => p.x !== points[0].x);
    if (hasBend) {
      // getting the last two points
      _firstX = points[points.length - 1];
      _secondX = points[points.length - 2];
      _firstY = points[points.length - 1];
      _secondY = points[points.length - 2];
    } else {
      if (orientation === 'RIGHT') {
        _firstX = points[0];
        _secondX = points[points.length - 1];
        _firstY = points[points.length / 2];
        _secondY = points[points.length / 2 - 1];
      } else {
        _firstX = points[points.length / 2];
        _secondX = points[points.length / 2 - 1];
        _firstY = points[0];
        _secondY = points[points.length - 1];
      }
    }
    edge.midPoint = {
      x: (_firstX.x + _secondX.x) / 2,
      y: (_firstY.y + _secondY.y) / 2
    };
  }
  basicUpdate() {
    if (this.view) {
      this.width = this.view[0];
      this.height = this.view[1];
    } else {
      const dims = this.getContainerDims();
      if (dims) {
        this.width = dims.width;
        this.height = dims.height;
      }
    }
    // default values if width or height are 0 or undefined
    if (!this.width) {
      this.width = 600;
    }
    if (!this.height) {
      this.height = 400;
    }
    this.width = Math.floor(this.width);
    this.height = Math.floor(this.height);
    if (this.cd) {
      this.cd.markForCheck();
    }
  }
  getContainerDims() {
    let width;
    let height;
    const hostElem = this.el.nativeElement;
    if (hostElem.parentNode !== null) {
      // Get the container dimensions
      const dims = hostElem.parentNode.getBoundingClientRect();
      width = dims.width;
      height = dims.height;
    }
    if (width && height) {
      return { width, height };
    }
    return null;
  }
  /**
   * Checks if the graph has dimensions
   */
  hasGraphDims() {
    return this.graphDims.width > 0 && this.graphDims.height > 0;
  }
  /**
   * Checks if all nodes have dimension
   */
  hasNodeDims() {
    return this.graph.nodes?.every(node => node.dimension.width > 0 && node.dimension.height > 0);
  }
  /**
   * Checks if all compound nodes have dimension
   */
  hasCompoundNodeDims() {
    return this.graph.compoundNodes?.every(node => node.dimension.width > 0 && node.dimension.height > 0);
  }
  /**
   * Checks if the graph and all nodes have dimension.
   */
  hasDims() {
    return this.hasGraphDims() && this.hasNodeDims() && this.hasCompoundNodeDims();
  }
  unbindEvents() {
    if (this.resizeSubscription) {
      this.resizeSubscription.unsubscribe();
    }
  }
  bindWindowResizeEvent() {
    const source = observableFromEvent(window, 'resize');
    const subscription = source.pipe(debounceTime(200)).subscribe(e => {
      this.update();
      if (this.cd) {
        this.cd.markForCheck();
      }
    });
    this.resizeSubscription = subscription;
  }
}
GraphComponent.ɵfac = i0.ɵɵngDeclareFactory({
  minVersion: '12.0.0',
  version: '13.3.11',
  ngImport: i0,
  type: GraphComponent,
  deps: [{ token: i0.ElementRef }, { token: i0.NgZone }, { token: i0.ChangeDetectorRef }, { token: i1.LayoutService }],
  target: i0.ɵɵFactoryTarget.Component
});
GraphComponent.ɵcmp = i0.ɵɵngDeclareComponent({
  minVersion: '12.0.0',
  version: '13.3.11',
  type: GraphComponent,
  selector: 'ngx-graph',
  inputs: {
    nodes: 'nodes',
    clusters: 'clusters',
    compoundNodes: 'compoundNodes',
    links: 'links',
    activeEntries: 'activeEntries',
    curve: 'curve',
    draggingEnabled: 'draggingEnabled',
    nodeHeight: 'nodeHeight',
    nodeMaxHeight: 'nodeMaxHeight',
    nodeMinHeight: 'nodeMinHeight',
    nodeWidth: 'nodeWidth',
    nodeMinWidth: 'nodeMinWidth',
    nodeMaxWidth: 'nodeMaxWidth',
    panningEnabled: 'panningEnabled',
    panningAxis: 'panningAxis',
    enableZoom: 'enableZoom',
    zoomSpeed: 'zoomSpeed',
    minZoomLevel: 'minZoomLevel',
    maxZoomLevel: 'maxZoomLevel',
    autoZoom: 'autoZoom',
    panOnZoom: 'panOnZoom',
    animate: 'animate',
    autoCenter: 'autoCenter',
    update$: 'update$',
    center$: 'center$',
    zoomToFit$: 'zoomToFit$',
    panToNode$: 'panToNode$',
    layout: 'layout',
    layoutSettings: 'layoutSettings',
    enableTrackpadSupport: 'enableTrackpadSupport',
    showMiniMap: 'showMiniMap',
    miniMapMaxWidth: 'miniMapMaxWidth',
    miniMapMaxHeight: 'miniMapMaxHeight',
    miniMapPosition: 'miniMapPosition',
    view: 'view',
    scheme: 'scheme',
    customColors: 'customColors',
    animations: 'animations',
    deferDisplayUntilPosition: 'deferDisplayUntilPosition',
    centerNodesOnPositionChange: 'centerNodesOnPositionChange',
    enablePreUpdateTransform: 'enablePreUpdateTransform',
    groupResultsBy: 'groupResultsBy',
    zoomLevel: 'zoomLevel',
    panOffsetX: 'panOffsetX',
    panOffsetY: 'panOffsetY'
  },
  outputs: {
    select: 'select',
    activate: 'activate',
    deactivate: 'deactivate',
    zoomChange: 'zoomChange',
    clickHandler: 'clickHandler',
    stateChange: 'stateChange'
  },
  host: {
    listeners: {
      'document:mousemove': 'onMouseMove($event)',
      'document:mousedown': 'onMouseDown($event)',
      'document:click': 'graphClick($event)',
      'document:touchmove': 'onTouchMove($event)',
      'document:mouseup': 'onMouseUp($event)'
    }
  },
  queries: [
    { propertyName: 'linkTemplate', first: true, predicate: ['linkTemplate'], descendants: true },
    { propertyName: 'nodeTemplate', first: true, predicate: ['nodeTemplate'], descendants: true },
    { propertyName: 'clusterTemplate', first: true, predicate: ['clusterTemplate'], descendants: true },
    { propertyName: 'defsTemplate', first: true, predicate: ['defsTemplate'], descendants: true },
    { propertyName: 'miniMapNodeTemplate', first: true, predicate: ['miniMapNodeTemplate'], descendants: true }
  ],
  viewQueries: [
    { propertyName: 'nodeElements', predicate: ['nodeElement'], descendants: true },
    { propertyName: 'linkElements', predicate: ['linkElement'], descendants: true }
  ],
  usesOnChanges: true,
  ngImport: i0,
  template:
    '<div\n  class="ngx-graph-outer"\n  [style.width.px]="width"\n  [@animationState]="\'active\'"\n  [@.disabled]="!animations"\n  (mouseWheelUp)="onZoom($event, \'in\')"\n  (mouseWheelDown)="onZoom($event, \'out\')"\n  mouseWheel\n>\n  <svg:svg class="ngx-graph" [attr.width]="width" [attr.height]="height">\n    <svg:g\n      *ngIf="initialized && graph"\n      [attr.transform]="transform"\n      (touchstart)="onTouchStart($event)"\n      (touchend)="onTouchEnd($event)"\n      class="graph chart"\n    >\n      <defs>\n        <ng-container *ngIf="defsTemplate" [ngTemplateOutlet]="defsTemplate"></ng-container>\n        <svg:path\n          class="text-path"\n          *ngFor="let link of graph.edges"\n          [attr.d]="link.textPath"\n          [attr.id]="link.id"\n        ></svg:path>\n      </defs>\n\n      <svg:rect\n        class="panning-rect"\n        [attr.width]="dims.width * 100"\n        [attr.height]="dims.height * 100"\n        [attr.transform]="\'translate(\' + (-dims.width || 0) * 50 + \',\' + (-dims.height || 0) * 50 + \')\'"\n        (mousedown)="isPanning = true"\n      />\n\n      <ng-content></ng-content>\n\n      <svg:g class="clusters">\n        <svg:g\n          #clusterElement\n          *ngFor="let node of graph.clusters; trackBy: trackNodeBy"\n          class="node-group"\n          [class.old-node]="animate && oldClusters.has(node.id)"\n          [id]="node.id"\n          [attr.transform]="node.transform"\n          (click)="onClick(node)"\n        >\n          <ng-container\n            *ngIf="clusterTemplate && !node.hidden"\n            [ngTemplateOutlet]="clusterTemplate"\n            [ngTemplateOutletContext]="{ $implicit: node }"\n          ></ng-container>\n          <svg:g *ngIf="!clusterTemplate" class="node cluster">\n            <svg:rect\n              [attr.width]="node.dimension.width"\n              [attr.height]="node.dimension.height"\n              [attr.fill]="node.data?.color"\n            />\n            <svg:text alignment-baseline="central" [attr.x]="10" [attr.y]="node.dimension.height / 2">\n              {{ node.label }}\n            </svg:text>\n          </svg:g>\n        </svg:g>\n      </svg:g>\n\n      <svg:g class="compound-nodes">\n        <svg:g\n          #nodeElement\n          *ngFor="let node of graph.compoundNodes; trackBy: trackNodeBy"\n          class="node-group"\n          [class.old-node]="animate && oldCompoundNodes.has(node.id)"\n          [id]="node.id"\n          [attr.transform]="node.transform"\n          (click)="onClick(node)"\n          (mousedown)="onNodeMouseDown($event, node)"\n        >\n          <ng-container\n            *ngIf="nodeTemplate && !node.hidden"\n            [ngTemplateOutlet]="nodeTemplate"\n            [ngTemplateOutletContext]="{ $implicit: node }"\n          ></ng-container>\n          <svg:g *ngIf="!nodeTemplate" class="node compound-node">\n            <svg:rect\n              [attr.width]="node.dimension.width"\n              [attr.height]="node.dimension.height"\n              [attr.fill]="node.data?.color"\n            />\n            <svg:text alignment-baseline="central" [attr.x]="10" [attr.y]="node.dimension.height / 2">\n              {{ node.label }}\n            </svg:text>\n          </svg:g>\n        </svg:g>\n      </svg:g>\n\n      <svg:g class="links">\n        <svg:g #linkElement *ngFor="let link of graph.edges; trackBy: trackLinkBy" class="link-group" [id]="link.id">\n          <ng-container\n            *ngIf="linkTemplate"\n            [ngTemplateOutlet]="linkTemplate"\n            [ngTemplateOutletContext]="{ $implicit: link }"\n          ></ng-container>\n          <svg:path *ngIf="!linkTemplate" class="edge" [attr.d]="link.line" />\n        </svg:g>\n      </svg:g>\n\n      <svg:g class="nodes">\n        <svg:g\n          #nodeElement\n          *ngFor="let node of graph.nodes; trackBy: trackNodeBy"\n          class="node-group"\n          [class.old-node]="animate && oldNodes.has(node.id)"\n          [id]="node.id"\n          [attr.transform]="node.transform"\n          (click)="onClick(node)"\n          (mousedown)="onNodeMouseDown($event, node)"\n        >\n          <ng-container\n            *ngIf="nodeTemplate && !node.hidden"\n            [ngTemplateOutlet]="nodeTemplate"\n            [ngTemplateOutletContext]="{ $implicit: node }"\n          ></ng-container>\n          <svg:circle\n            *ngIf="!nodeTemplate"\n            r="10"\n            [attr.cx]="node.dimension.width / 2"\n            [attr.cy]="node.dimension.height / 2"\n            [attr.fill]="node.data?.color"\n          />\n        </svg:g>\n      </svg:g>\n    </svg:g>\n\n    <svg:clipPath [attr.id]="minimapClipPathId">\n      <svg:rect\n        [attr.width]="graphDims.width / minimapScaleCoefficient"\n        [attr.height]="graphDims.height / minimapScaleCoefficient"\n      ></svg:rect>\n    </svg:clipPath>\n\n    <svg:g\n      class="minimap"\n      *ngIf="showMiniMap"\n      [attr.transform]="minimapTransform"\n      [attr.clip-path]="\'url(#\' + minimapClipPathId + \')\'"\n    >\n      <svg:rect\n        class="minimap-background"\n        [attr.width]="graphDims.width / minimapScaleCoefficient"\n        [attr.height]="graphDims.height / minimapScaleCoefficient"\n        (mousedown)="onMinimapPanTo($event)"\n      ></svg:rect>\n\n      <svg:g\n        [style.transform]="\n          \'translate(\' +\n          -minimapOffsetX / minimapScaleCoefficient +\n          \'px,\' +\n          -minimapOffsetY / minimapScaleCoefficient +\n          \'px)\'\n        "\n      >\n        <svg:g class="minimap-nodes" [style.transform]="\'scale(\' + 1 / minimapScaleCoefficient + \')\'">\n          <svg:g\n            #nodeElement\n            *ngFor="let node of graph.nodes; trackBy: trackNodeBy"\n            class="node-group"\n            [class.old-node]="animate && oldNodes.has(node.id)"\n            [id]="node.id"\n            [attr.transform]="node.transform"\n          >\n            <ng-container\n              *ngIf="miniMapNodeTemplate"\n              [ngTemplateOutlet]="miniMapNodeTemplate"\n              [ngTemplateOutletContext]="{ $implicit: node }"\n            ></ng-container>\n            <ng-container\n              *ngIf="!miniMapNodeTemplate && nodeTemplate"\n              [ngTemplateOutlet]="nodeTemplate"\n              [ngTemplateOutletContext]="{ $implicit: node }"\n            ></ng-container>\n            <svg:circle\n              *ngIf="!nodeTemplate && !miniMapNodeTemplate"\n              r="10"\n              [attr.cx]="node.dimension.width / 2 / minimapScaleCoefficient"\n              [attr.cy]="node.dimension.height / 2 / minimapScaleCoefficient"\n              [attr.fill]="node.data?.color"\n            />\n          </svg:g>\n        </svg:g>\n\n        <svg:rect\n          [attr.transform]="\n            \'translate(\' +\n            panOffsetX / zoomLevel / -minimapScaleCoefficient +\n            \',\' +\n            panOffsetY / zoomLevel / -minimapScaleCoefficient +\n            \')\'\n          "\n          class="minimap-drag"\n          [class.panning]="isMinimapPanning"\n          [attr.width]="width / minimapScaleCoefficient / zoomLevel"\n          [attr.height]="height / minimapScaleCoefficient / zoomLevel"\n          (mousedown)="onMinimapDragMouseDown()"\n        ></svg:rect>\n      </svg:g>\n    </svg:g>\n  </svg:svg>\n</div>\n',
  styles: [
    '.minimap .minimap-background{fill:#0000001a}.minimap .minimap-drag{fill:#0003;stroke:#fff;stroke-width:1px;stroke-dasharray:2px;stroke-dashoffset:2px;cursor:pointer}.minimap .minimap-drag.panning{fill:#0000004d}.minimap .minimap-nodes{opacity:.5;pointer-events:none}.graph{-webkit-user-select:none;-moz-user-select:none;user-select:none}.graph .edge{stroke:#666;fill:none}.graph .edge .edge-label{stroke:none;font-size:12px;fill:#251e1e}.graph .panning-rect{fill:#0000;cursor:move}.graph .node-group.old-node{transition:transform .5s ease-in-out}.graph .node-group .node:focus{outline:none}.graph .compound-node rect{opacity:.5}.graph .cluster rect{opacity:.2}\n'
  ],
  directives: [
    { type: i2.MouseWheelDirective, selector: '[mouseWheel]', outputs: ['mouseWheelUp', 'mouseWheelDown'] },
    { type: i3.NgIf, selector: '[ngIf]', inputs: ['ngIf', 'ngIfThen', 'ngIfElse'] },
    {
      type: i3.NgTemplateOutlet,
      selector: '[ngTemplateOutlet]',
      inputs: ['ngTemplateOutletContext', 'ngTemplateOutlet']
    },
    { type: i3.NgForOf, selector: '[ngFor][ngForOf]', inputs: ['ngForOf', 'ngForTrackBy', 'ngForTemplate'] }
  ],
  animations: [
    trigger('animationState', [
      ngTransition(':enter', [style({ opacity: 0 }), animate('500ms 100ms', style({ opacity: 1 }))])
    ])
  ],
  changeDetection: i0.ChangeDetectionStrategy.OnPush,
  encapsulation: i0.ViewEncapsulation.None
});
__decorate([throttleable(500)], GraphComponent.prototype, 'updateMinimap', null);
i0.ɵɵngDeclareClassMetadata({
  minVersion: '12.0.0',
  version: '13.3.11',
  ngImport: i0,
  type: GraphComponent,
  decorators: [
    {
      type: Component,
      args: [
        {
          selector: 'ngx-graph',
          encapsulation: ViewEncapsulation.None,
          changeDetection: ChangeDetectionStrategy.OnPush,
          animations: [
            trigger('animationState', [
              ngTransition(':enter', [style({ opacity: 0 }), animate('500ms 100ms', style({ opacity: 1 }))])
            ])
          ],
          template:
            '<div\n  class="ngx-graph-outer"\n  [style.width.px]="width"\n  [@animationState]="\'active\'"\n  [@.disabled]="!animations"\n  (mouseWheelUp)="onZoom($event, \'in\')"\n  (mouseWheelDown)="onZoom($event, \'out\')"\n  mouseWheel\n>\n  <svg:svg class="ngx-graph" [attr.width]="width" [attr.height]="height">\n    <svg:g\n      *ngIf="initialized && graph"\n      [attr.transform]="transform"\n      (touchstart)="onTouchStart($event)"\n      (touchend)="onTouchEnd($event)"\n      class="graph chart"\n    >\n      <defs>\n        <ng-container *ngIf="defsTemplate" [ngTemplateOutlet]="defsTemplate"></ng-container>\n        <svg:path\n          class="text-path"\n          *ngFor="let link of graph.edges"\n          [attr.d]="link.textPath"\n          [attr.id]="link.id"\n        ></svg:path>\n      </defs>\n\n      <svg:rect\n        class="panning-rect"\n        [attr.width]="dims.width * 100"\n        [attr.height]="dims.height * 100"\n        [attr.transform]="\'translate(\' + (-dims.width || 0) * 50 + \',\' + (-dims.height || 0) * 50 + \')\'"\n        (mousedown)="isPanning = true"\n      />\n\n      <ng-content></ng-content>\n\n      <svg:g class="clusters">\n        <svg:g\n          #clusterElement\n          *ngFor="let node of graph.clusters; trackBy: trackNodeBy"\n          class="node-group"\n          [class.old-node]="animate && oldClusters.has(node.id)"\n          [id]="node.id"\n          [attr.transform]="node.transform"\n          (click)="onClick(node)"\n        >\n          <ng-container\n            *ngIf="clusterTemplate && !node.hidden"\n            [ngTemplateOutlet]="clusterTemplate"\n            [ngTemplateOutletContext]="{ $implicit: node }"\n          ></ng-container>\n          <svg:g *ngIf="!clusterTemplate" class="node cluster">\n            <svg:rect\n              [attr.width]="node.dimension.width"\n              [attr.height]="node.dimension.height"\n              [attr.fill]="node.data?.color"\n            />\n            <svg:text alignment-baseline="central" [attr.x]="10" [attr.y]="node.dimension.height / 2">\n              {{ node.label }}\n            </svg:text>\n          </svg:g>\n        </svg:g>\n      </svg:g>\n\n      <svg:g class="compound-nodes">\n        <svg:g\n          #nodeElement\n          *ngFor="let node of graph.compoundNodes; trackBy: trackNodeBy"\n          class="node-group"\n          [class.old-node]="animate && oldCompoundNodes.has(node.id)"\n          [id]="node.id"\n          [attr.transform]="node.transform"\n          (click)="onClick(node)"\n          (mousedown)="onNodeMouseDown($event, node)"\n        >\n          <ng-container\n            *ngIf="nodeTemplate && !node.hidden"\n            [ngTemplateOutlet]="nodeTemplate"\n            [ngTemplateOutletContext]="{ $implicit: node }"\n          ></ng-container>\n          <svg:g *ngIf="!nodeTemplate" class="node compound-node">\n            <svg:rect\n              [attr.width]="node.dimension.width"\n              [attr.height]="node.dimension.height"\n              [attr.fill]="node.data?.color"\n            />\n            <svg:text alignment-baseline="central" [attr.x]="10" [attr.y]="node.dimension.height / 2">\n              {{ node.label }}\n            </svg:text>\n          </svg:g>\n        </svg:g>\n      </svg:g>\n\n      <svg:g class="links">\n        <svg:g #linkElement *ngFor="let link of graph.edges; trackBy: trackLinkBy" class="link-group" [id]="link.id">\n          <ng-container\n            *ngIf="linkTemplate"\n            [ngTemplateOutlet]="linkTemplate"\n            [ngTemplateOutletContext]="{ $implicit: link }"\n          ></ng-container>\n          <svg:path *ngIf="!linkTemplate" class="edge" [attr.d]="link.line" />\n        </svg:g>\n      </svg:g>\n\n      <svg:g class="nodes">\n        <svg:g\n          #nodeElement\n          *ngFor="let node of graph.nodes; trackBy: trackNodeBy"\n          class="node-group"\n          [class.old-node]="animate && oldNodes.has(node.id)"\n          [id]="node.id"\n          [attr.transform]="node.transform"\n          (click)="onClick(node)"\n          (mousedown)="onNodeMouseDown($event, node)"\n        >\n          <ng-container\n            *ngIf="nodeTemplate && !node.hidden"\n            [ngTemplateOutlet]="nodeTemplate"\n            [ngTemplateOutletContext]="{ $implicit: node }"\n          ></ng-container>\n          <svg:circle\n            *ngIf="!nodeTemplate"\n            r="10"\n            [attr.cx]="node.dimension.width / 2"\n            [attr.cy]="node.dimension.height / 2"\n            [attr.fill]="node.data?.color"\n          />\n        </svg:g>\n      </svg:g>\n    </svg:g>\n\n    <svg:clipPath [attr.id]="minimapClipPathId">\n      <svg:rect\n        [attr.width]="graphDims.width / minimapScaleCoefficient"\n        [attr.height]="graphDims.height / minimapScaleCoefficient"\n      ></svg:rect>\n    </svg:clipPath>\n\n    <svg:g\n      class="minimap"\n      *ngIf="showMiniMap"\n      [attr.transform]="minimapTransform"\n      [attr.clip-path]="\'url(#\' + minimapClipPathId + \')\'"\n    >\n      <svg:rect\n        class="minimap-background"\n        [attr.width]="graphDims.width / minimapScaleCoefficient"\n        [attr.height]="graphDims.height / minimapScaleCoefficient"\n        (mousedown)="onMinimapPanTo($event)"\n      ></svg:rect>\n\n      <svg:g\n        [style.transform]="\n          \'translate(\' +\n          -minimapOffsetX / minimapScaleCoefficient +\n          \'px,\' +\n          -minimapOffsetY / minimapScaleCoefficient +\n          \'px)\'\n        "\n      >\n        <svg:g class="minimap-nodes" [style.transform]="\'scale(\' + 1 / minimapScaleCoefficient + \')\'">\n          <svg:g\n            #nodeElement\n            *ngFor="let node of graph.nodes; trackBy: trackNodeBy"\n            class="node-group"\n            [class.old-node]="animate && oldNodes.has(node.id)"\n            [id]="node.id"\n            [attr.transform]="node.transform"\n          >\n            <ng-container\n              *ngIf="miniMapNodeTemplate"\n              [ngTemplateOutlet]="miniMapNodeTemplate"\n              [ngTemplateOutletContext]="{ $implicit: node }"\n            ></ng-container>\n            <ng-container\n              *ngIf="!miniMapNodeTemplate && nodeTemplate"\n              [ngTemplateOutlet]="nodeTemplate"\n              [ngTemplateOutletContext]="{ $implicit: node }"\n            ></ng-container>\n            <svg:circle\n              *ngIf="!nodeTemplate && !miniMapNodeTemplate"\n              r="10"\n              [attr.cx]="node.dimension.width / 2 / minimapScaleCoefficient"\n              [attr.cy]="node.dimension.height / 2 / minimapScaleCoefficient"\n              [attr.fill]="node.data?.color"\n            />\n          </svg:g>\n        </svg:g>\n\n        <svg:rect\n          [attr.transform]="\n            \'translate(\' +\n            panOffsetX / zoomLevel / -minimapScaleCoefficient +\n            \',\' +\n            panOffsetY / zoomLevel / -minimapScaleCoefficient +\n            \')\'\n          "\n          class="minimap-drag"\n          [class.panning]="isMinimapPanning"\n          [attr.width]="width / minimapScaleCoefficient / zoomLevel"\n          [attr.height]="height / minimapScaleCoefficient / zoomLevel"\n          (mousedown)="onMinimapDragMouseDown()"\n        ></svg:rect>\n      </svg:g>\n    </svg:g>\n  </svg:svg>\n</div>\n',
          styles: [
            '.minimap .minimap-background{fill:#0000001a}.minimap .minimap-drag{fill:#0003;stroke:#fff;stroke-width:1px;stroke-dasharray:2px;stroke-dashoffset:2px;cursor:pointer}.minimap .minimap-drag.panning{fill:#0000004d}.minimap .minimap-nodes{opacity:.5;pointer-events:none}.graph{-webkit-user-select:none;-moz-user-select:none;user-select:none}.graph .edge{stroke:#666;fill:none}.graph .edge .edge-label{stroke:none;font-size:12px;fill:#251e1e}.graph .panning-rect{fill:#0000;cursor:move}.graph .node-group.old-node{transition:transform .5s ease-in-out}.graph .node-group .node:focus{outline:none}.graph .compound-node rect{opacity:.5}.graph .cluster rect{opacity:.2}\n'
          ]
        }
      ]
    }
  ],
  ctorParameters: function () {
    return [{ type: i0.ElementRef }, { type: i0.NgZone }, { type: i0.ChangeDetectorRef }, { type: i1.LayoutService }];
  },
  propDecorators: {
    nodes: [
      {
        type: Input
      }
    ],
    clusters: [
      {
        type: Input
      }
    ],
    compoundNodes: [
      {
        type: Input
      }
    ],
    links: [
      {
        type: Input
      }
    ],
    activeEntries: [
      {
        type: Input
      }
    ],
    curve: [
      {
        type: Input
      }
    ],
    draggingEnabled: [
      {
        type: Input
      }
    ],
    nodeHeight: [
      {
        type: Input
      }
    ],
    nodeMaxHeight: [
      {
        type: Input
      }
    ],
    nodeMinHeight: [
      {
        type: Input
      }
    ],
    nodeWidth: [
      {
        type: Input
      }
    ],
    nodeMinWidth: [
      {
        type: Input
      }
    ],
    nodeMaxWidth: [
      {
        type: Input
      }
    ],
    panningEnabled: [
      {
        type: Input
      }
    ],
    panningAxis: [
      {
        type: Input
      }
    ],
    enableZoom: [
      {
        type: Input
      }
    ],
    zoomSpeed: [
      {
        type: Input
      }
    ],
    minZoomLevel: [
      {
        type: Input
      }
    ],
    maxZoomLevel: [
      {
        type: Input
      }
    ],
    autoZoom: [
      {
        type: Input
      }
    ],
    panOnZoom: [
      {
        type: Input
      }
    ],
    animate: [
      {
        type: Input
      }
    ],
    autoCenter: [
      {
        type: Input
      }
    ],
    update$: [
      {
        type: Input
      }
    ],
    center$: [
      {
        type: Input
      }
    ],
    zoomToFit$: [
      {
        type: Input
      }
    ],
    panToNode$: [
      {
        type: Input
      }
    ],
    layout: [
      {
        type: Input
      }
    ],
    layoutSettings: [
      {
        type: Input
      }
    ],
    enableTrackpadSupport: [
      {
        type: Input
      }
    ],
    showMiniMap: [
      {
        type: Input
      }
    ],
    miniMapMaxWidth: [
      {
        type: Input
      }
    ],
    miniMapMaxHeight: [
      {
        type: Input
      }
    ],
    miniMapPosition: [
      {
        type: Input
      }
    ],
    view: [
      {
        type: Input
      }
    ],
    scheme: [
      {
        type: Input
      }
    ],
    customColors: [
      {
        type: Input
      }
    ],
    animations: [
      {
        type: Input
      }
    ],
    deferDisplayUntilPosition: [
      {
        type: Input
      }
    ],
    centerNodesOnPositionChange: [
      {
        type: Input
      }
    ],
    enablePreUpdateTransform: [
      {
        type: Input
      }
    ],
    select: [
      {
        type: Output
      }
    ],
    activate: [
      {
        type: Output
      }
    ],
    deactivate: [
      {
        type: Output
      }
    ],
    zoomChange: [
      {
        type: Output
      }
    ],
    clickHandler: [
      {
        type: Output
      }
    ],
    stateChange: [
      {
        type: Output
      }
    ],
    linkTemplate: [
      {
        type: ContentChild,
        args: ['linkTemplate']
      }
    ],
    nodeTemplate: [
      {
        type: ContentChild,
        args: ['nodeTemplate']
      }
    ],
    clusterTemplate: [
      {
        type: ContentChild,
        args: ['clusterTemplate']
      }
    ],
    defsTemplate: [
      {
        type: ContentChild,
        args: ['defsTemplate']
      }
    ],
    miniMapNodeTemplate: [
      {
        type: ContentChild,
        args: ['miniMapNodeTemplate']
      }
    ],
    nodeElements: [
      {
        type: ViewChildren,
        args: ['nodeElement']
      }
    ],
    linkElements: [
      {
        type: ViewChildren,
        args: ['linkElement']
      }
    ],
    groupResultsBy: [
      {
        type: Input
      }
    ],
    zoomLevel: [
      {
        type: Input,
        args: ['zoomLevel']
      }
    ],
    panOffsetX: [
      {
        type: Input,
        args: ['panOffsetX']
      }
    ],
    panOffsetY: [
      {
        type: Input,
        args: ['panOffsetY']
      }
    ],
    updateMinimap: [],
    onMouseMove: [
      {
        type: HostListener,
        args: ['document:mousemove', ['$event']]
      }
    ],
    onMouseDown: [
      {
        type: HostListener,
        args: ['document:mousedown', ['$event']]
      }
    ],
    graphClick: [
      {
        type: HostListener,
        args: ['document:click', ['$event']]
      }
    ],
    onTouchMove: [
      {
        type: HostListener,
        args: ['document:touchmove', ['$event']]
      }
    ],
    onMouseUp: [
      {
        type: HostListener,
        args: ['document:mouseup', ['$event']]
      }
    ]
  }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGguY29tcG9uZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3dpbWxhbmUvbmd4LWdyYXBoL3NyYy9saWIvZ3JhcGgvZ3JhcGguY29tcG9uZW50LnRzIiwiLi4vLi4vLi4vLi4vLi4vc3dpbWxhbmUvbmd4LWdyYXBoL3NyYy9saWIvZ3JhcGgvZ3JhcGguY29tcG9uZW50Lmh0bWwiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHVEQUF1RDtBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxVQUFVLElBQUksWUFBWSxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzFGLE9BQU8sRUFFTCx1QkFBdUIsRUFDdkIsU0FBUyxFQUNULFlBQVksRUFFWixZQUFZLEVBQ1osWUFBWSxFQUNaLEtBQUssRUFHTCxNQUFNLEVBR04sWUFBWSxFQUNaLGlCQUFpQixFQUtsQixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3RDLE9BQU8sS0FBSyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ2xDLE9BQU8sS0FBSyxJQUFJLE1BQU0sU0FBUyxDQUFDO0FBQ2hDLE9BQU8sZUFBZSxDQUFDO0FBQ3ZCLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxTQUFTLElBQUksbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQy9GLE9BQU8sRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBTW5HLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDakMsT0FBTyxFQUFFLFdBQVcs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QVEsQ0FBQztRQUVyQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2hELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDdkQsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUN2RCxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ3JHLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7U0FDeEc7UUFDRCxJQUFJLElBQUksR0FBRyxDQUFDO1FBQ1osSUFBSSxJQUFJLEdBQUcsQ0FBQztRQUNaLElBQUksSUFBSSxHQUFHLENBQUM7UUFDWixJQUFJLElBQUksR0FBRyxDQUFDO1FBQ1osSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQzNCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQzdCLENBQUM7SUFHRCxhQUFhO1FBQ1gsa0VBQWtFO1FBQ2xFLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFO1lBQy9DLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUV2QixJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUU7Z0JBQ3hCLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDO2FBQzVFO1lBQ0QsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQ3pCLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUNyQyxJQUFJLENBQUMsdUJBQXVCLEVBQzVCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FDOUMsQ0FBQzthQUNIO1lBRUQsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1NBQ3BEO0lBQ0gsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxtQkFBbUI7UUFDakIsSUFBSSxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFO1lBQ2pELElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUMzQixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO2dCQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDbkUsSUFBSSxDQUFDLElBQUksRUFBRTtvQkFDVCxPQUFPO2lCQUNSO2dCQUVELHVCQUF1QjtnQkFDdkIsSUFBSSxJQUFJLENBQUM7Z0JBQ1QsSUFBSTtvQkFDRixJQUFJLEdBQUcsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMvQixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7d0JBQy9CLE9BQU87cUJBQ1I7aUJBQ0Y7Z0JBQUMsT0FBTyxFQUFFLEVBQUU7b0JBQ1gsK0VBQStFO29CQUMvRSxPQUFPO2lCQUNSO2dCQUNELElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRTtvQkFDbkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNO3dCQUNuQixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7aUJBQ2hHO3FCQUFNO29CQUNMLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTTt3QkFDbkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO2lCQUM1RjtnQkFFRCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2lCQUM3RTtnQkFDRCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2lCQUM3RTtnQkFFRCxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUU7b0JBQ2xCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSzt3QkFDbEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2lCQUM3RjtxQkFBTTtvQkFDTCxzQkFBc0I7b0JBQ3RCLElBQUksYUFBYSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRTt3QkFDckQsSUFBSSxXQUFXLENBQUM7d0JBQ2hCLElBQUk7NEJBQ0YsS0FBSyxNQUFNLFFBQVEsSUFBSSxhQUFhLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0NBQ2pFLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQ0FDdkMsSUFBSSxDQUFDLFdBQVcsRUFBRTtvQ0FDaEIsV0FBVyxHQUFHLFdBQVcsQ0FBQztpQ0FDM0I7cUNBQU07b0NBQ0wsSUFBSSxXQUFXLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUU7d0NBQ3pDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQztxQ0FDdkM7b0NBQ0QsSUFBSSxXQUFXLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUU7d0NBQzNDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztxQ0FDekM7aUNBQ0Y7NkJBQ0Y7eUJBQ0Y7d0JBQUMsT0FBTyxFQUFFLEVBQUU7NEJBQ1gsK0VBQStFOzRCQUMvRSxPQUFPO3lCQUNSO3dCQUNELElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSzs0QkFDbEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztxQkFDckc7eUJBQU07d0JBQ0wsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLOzRCQUNsQixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7cUJBQ3pGO2lCQUNGO2dCQUVELElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtvQkFDckIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7aUJBQzFFO2dCQUNELElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtvQkFDckIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7aUJBQzFFO1lBQ0gsQ0FBQyxDQUFDLENBQUM7U0FDSjtJQUNILENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsV0FBVyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTztRQUNqQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUM3QixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFOUUsSUFBSSxJQUFJLEVBQUU7Z0JBQ1IsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ25FLGFBQWE7cUJBQ1YsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDO3FCQUN2QixVQUFVLEVBQUU7cUJBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7cUJBQ3ZCLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUM1QixJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFeEIsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDOUUsaUJBQWlCO3FCQUNkLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQztxQkFDM0IsVUFBVSxFQUFFO3FCQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO3FCQUN2QixRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztxQkFDNUIsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRTVCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQzlDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILG9CQUFvQixDQUFDLElBQUk7UUFDdkIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUVqQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxDQUFDLENBQUMsRUFBRTtZQUM5QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsa0JBQWtCLENBQUM7WUFFM0MscURBQXFEO1lBQ3JELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7U0FDL0Q7YUFBTTtZQUNMLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQztZQUMxQyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7U0FDM0I7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILFlBQVksQ0FBQyxNQUFXO1FBQ3RCLE1BQU0sWUFBWSxHQUFHLEtBQUs7YUFDdkIsSUFBSSxFQUFPO2FBQ1gsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNYLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDWCxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JCLE9BQU8sWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsTUFBTSxDQUFDLE1BQWtCLEVBQUUsU0FBUztRQUNsQyxJQUFJLElBQUksQ0FBQyxxQkFBcUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUU7WUFDakQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRCxPQUFPO1NBQ1I7UUFFRCxNQUFNLFVBQVUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUvRSxtREFBbUQ7UUFDbkQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUM7UUFDakQsSUFBSSxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtZQUMxRSxPQUFPO1NBQ1I7UUFFRCxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDcEIsT0FBTztTQUNSO1FBRUQsSUFBSSxJQUFJLENBQUMsU0FBUyxLQUFLLElBQUksSUFBSSxNQUFNLEVBQUU7WUFDckMsbUNBQW1DO1lBQ25DLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFDOUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztZQUU5Qix5Q0FBeUM7WUFDekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFOUMsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ25DLEtBQUssQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDO1lBQ2pCLEtBQUssQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDO1lBQ2pCLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFFMUUsVUFBVTtZQUNWLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDdEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQzFDO2FBQU07WUFDTCxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1NBQ3ZCO0lBQ0gsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsR0FBRyxDQUFDLENBQVMsRUFBRSxDQUFTLEVBQUUsa0JBQTJCLEtBQUs7UUFDeEQsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDdkQsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLENBQUMsR0FBRyxTQUFTLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFFMUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsQ0FBUyxFQUFFLENBQVM7UUFDeEIsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxTQUFTLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDMUYsT0FBTztTQUNSO1FBRUQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUN6RSxNQUFNLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBRTFFLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxTQUFTLENBQ25DLElBQUksQ0FBQyxvQkFBb0IsRUFDekIsU0FBUyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQ3hELENBQUM7UUFFRixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDekIsQ0FBQztJQUVEOzs7T0FHRztJQUNILElBQUksQ0FBQyxNQUFjO1FBQ2pCLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxNQUFNLENBQUMsS0FBYTtRQUNsQixJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pGLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekYsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JDLElBQUksSUFBSSxDQUFDLHdCQUF3QixFQUFFO1lBQ2pDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztTQUN4QjtRQUNELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILE1BQU0sQ0FBQyxLQUFpQjtRQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRTtZQUN6QixPQUFPO1NBQ1I7UUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBQy9CLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ3hFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztTQUNqQztRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUNwRCxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7UUFFcEQsZ0JBQWdCO1FBQ2hCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9GLElBQUksQ0FBQyxTQUFTLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFFekMsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRTtZQUNuQyxJQUNFLElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLEVBQUU7Z0JBQ3ZCLElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLEVBQUU7Z0JBQ3RCLElBQUksQ0FBQyxNQUFjLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFO2dCQUNsQyxJQUFJLENBQUMsTUFBYyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxFQUNuQztnQkFDQSxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksT0FBTyxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRTtvQkFDbEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDeEQsTUFBTSxPQUFPLEdBQUcsTUFBTSxZQUFZLFVBQVUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ25FLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQ3hCLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQUU7d0JBQ3hCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO3dCQUNuQixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN4QixDQUFDLENBQUMsQ0FDSCxDQUFDO2lCQUNIO2FBQ0Y7U0FDRjtRQUVELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxVQUFVLENBQUMsSUFBVTtRQUNuQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ25CLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILGVBQWU7UUFDYixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsT0FBTyxDQUFDLEtBQVU7UUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsVUFBVSxDQUFDLEtBQUs7UUFDZCxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO1lBQzFDLE9BQU87U0FDUjtRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILFlBQVksQ0FBQyxLQUFLO1FBQ2hCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFN0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILGVBQWU7UUFDYixPQUFPLElBQUksQ0FBQyxLQUFLO2FBQ2QsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNoQyxNQUFNLENBQUMsQ0FBQyxLQUFlLEVBQUUsSUFBSSxFQUFTLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7YUFDekcsSUFBSSxFQUFFLENBQUM7SUFDWixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxXQUFXLENBQUMsS0FBYSxFQUFFLElBQVU7UUFDbkMsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILFdBQVcsQ0FBQyxLQUFhLEVBQUUsSUFBVTtRQUNuQyxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsU0FBUztRQUNQLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUVILFdBQVcsQ0FBQyxNQUFrQjtRQUM1QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUU7WUFDcEUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7U0FDbkQ7YUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRTtZQUNsRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3JCO0lBQ0gsQ0FBQztJQUdELFdBQVcsQ0FBQyxLQUFpQjtRQUMzQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO0lBQ2pDLENBQUM7SUFHRCxVQUFVLENBQUMsS0FBaUI7UUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUI7WUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILFlBQVksQ0FBQyxLQUFVO1FBQ3JCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDbkQsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztJQUN4QixDQUFDO0lBRUQ7OztPQUdHO0lBRUgsV0FBVyxDQUFDLE1BQVc7UUFDckIsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUU7WUFDekMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDakQsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDakQsTUFBTSxTQUFTLEdBQUcsT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7WUFDN0MsTUFBTSxTQUFTLEdBQUcsT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7WUFDN0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUM7WUFDM0IsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUM7WUFFM0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7U0FDaEM7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILFVBQVUsQ0FBQyxLQUFVO1FBQ25CLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7OztPQUlHO0lBRUgsU0FBUyxDQUFDLEtBQWlCO1FBQ3pCLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFDOUIsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUU7WUFDM0UsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztTQUNqRDtJQUNILENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsZUFBZSxDQUFDLEtBQWlCLEVBQUUsSUFBUztRQUMxQyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRTtZQUN6QixPQUFPO1NBQ1I7UUFDRCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUN2QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUV6QixJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksT0FBTyxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRTtZQUM3RSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDdEM7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILHNCQUFzQjtRQUNwQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO0lBQy9CLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsY0FBYyxDQUFDLEtBQWlCO1FBQzlCLE1BQU0sQ0FBQyxHQUNMLEtBQUssQ0FBQyxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNsSCxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1FBRTdFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDL0UsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQztJQUMvQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNO1FBQ0osSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsU0FBUyxDQUFDLFdBQWlDO1FBQ3pDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUM1RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztRQUN6RCxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbkQsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRTtZQUNqQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztTQUMvQjtRQUVELElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDakMsU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7U0FDL0I7UUFFRCxJQUFJLFdBQVcsRUFBRSxLQUFLLEtBQUssSUFBSSxJQUFJLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQy9ELElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1lBRTNCLElBQUksV0FBVyxFQUFFLFVBQVUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzthQUN4QjtZQUNELElBQUksV0FBVyxFQUFFLFVBQVUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQzthQUNmO1lBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1NBQ3RDO0lBQ0gsQ0FBQztJQUVEOzs7T0FHRztJQUNILFdBQVcsQ0FBQyxNQUFjO1FBQ3hCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssTUFBTSxDQUFDLENBQUM7UUFDekQsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNULE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsdUJBQXVCLENBQUMsR0FBa0I7UUFDeEMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVPLGtCQUFrQixDQUFDLEdBQVcsRUFBRSxLQUFpQjtRQUN2RCxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDeEIsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7WUFDekIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ3ZELENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztTQUN4RDtRQUVELFFBQVEsR0FBRyxFQUFFO1lBQ1gsS0FBSyxXQUFXLENBQUMsVUFBVTtnQkFDekIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsTUFBTTtZQUNSLEtBQUssV0FBVyxDQUFDLFFBQVE7Z0JBQ3ZCLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNmLE1BQU07WUFDUjtnQkFDRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDZixNQUFNO1NBQ1Q7SUFDSCxDQUFDO0lBRU8sb0JBQW9CLENBQUMsSUFBVSxFQUFFLE1BQVc7UUFDbEQsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNwQixPQUFPO1NBQ1I7UUFFRCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUMzQixJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN2RDthQUFNO1lBQ0wsd0NBQXdDO1lBQ3hDLElBQUssSUFBSSxDQUFDLE1BQWlCLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFFO2dCQUNwRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2FBQ3JDO2lCQUFNO2dCQUNMLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN6QyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLElBQUksQ0FBQyxRQUFRLEdBQUc7b0JBQ2QsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztvQkFDN0IsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztpQkFDOUIsQ0FBQzthQUNIO1NBQ0Y7SUFDSCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsSUFBVSxFQUFFLE1BQVc7UUFDOUMsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBQ25CLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDbkIsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sV0FBVyxHQUFJLElBQUksQ0FBQyxNQUFpQixDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEYsTUFBTSxPQUFPLEdBQ1gsV0FBVyxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFMUcsSUFBSSxPQUFPLEVBQUU7WUFDWCw4QkFBOEI7WUFDOUIsT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNyQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDcEMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQ3RDO2FBQU07WUFDTCxJQUFJLFdBQVcsS0FBSyxPQUFPLEVBQUU7Z0JBQzNCLE9BQU8sR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDckMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2FBQzFDO2lCQUFNO2dCQUNMLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDekMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEIsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2FBQ3RDO1NBQ0Y7UUFFRCxJQUFJLENBQUMsUUFBUSxHQUFHO1lBQ2QsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUMvQixDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1NBQ2hDLENBQUM7SUFDSixDQUFDO0lBRU0sV0FBVztRQUNoQixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDYixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzVCO2FBQU07WUFDTCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUNyQyxJQUFJLElBQUksRUFBRTtnQkFDUixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7Z0JBQ3hCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQzthQUMzQjtTQUNGO1FBRUQsdURBQXVEO1FBQ3ZELElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7U0FDbEI7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNoQixJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztTQUNuQjtRQUVELElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV0QyxJQUFJLElBQUksQ0FBQyxFQUFFLEVBQUU7WUFDWCxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxDQUFDO1NBQ3hCO0lBQ0gsQ0FBQztJQUVNLGdCQUFnQjtRQUNyQixJQUFJLEtBQUssQ0FBQztRQUNWLElBQUksTUFBTSxDQUFDO1FBQ1gsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUM7UUFFdkMsSUFBSSxRQUFRLENBQUMsVUFBVSxLQUFLLElBQUksRUFBRTtZQUNoQywrQkFBK0I7WUFDL0IsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3pELEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ25CLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1NBQ3RCO1FBRUQsSUFBSSxLQUFLLElBQUksTUFBTSxFQUFFO1lBQ25CLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7U0FDMUI7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNJLFlBQVk7UUFDakIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRDs7T0FFRztJQUNJLFdBQVc7UUFDaEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVEOztPQUVHO0lBQ0ksbUJBQW1CO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3hHLENBQUM7SUFFRDs7T0FFRztJQUNJLE9BQU87UUFDWixPQUFPLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDakYsQ0FBQztJQUVTLFlBQVk7UUFDcEIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUU7WUFDM0IsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQ3ZDO0lBQ0gsQ0FBQztJQUVPLHFCQUFxQjtRQUMzQixNQUFNLE1BQU0sR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDckQsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2QsSUFBSSxJQUFJLENBQUMsRUFBRSxFQUFFO2dCQUNYLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLENBQUM7YUFDeEI7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxrQkFBa0IsR0FBRyxZQUFZLENBQUM7SUFDekMsQ0FBQzs7NEdBcnhDVSxjQUFjO2dHQUFkLGNBQWMsMjZFQ2xGM0IsODdPQWdOQSw0bENEcEljO1FBQ1YsT0FBTyxDQUFDLGdCQUFnQixFQUFFO1lBQ3hCLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxPQUFPLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUMvRixDQUFDO0tBQ0g7QUFpaUJEO0lBREMsWUFBWSxDQUFDLEdBQUcsQ0FBQzttREFrQmpCOzRGQWhqQlUsY0FBYztrQkFaMUIsU0FBUzsrQkFDRSxXQUFXLGlCQUdOLGlCQUFpQixDQUFDLElBQUksbUJBQ3BCLHVCQUF1QixDQUFDLE1BQU0sY0FDbkM7d0JBQ1YsT0FBTyxDQUFDLGdCQUFnQixFQUFFOzRCQUN4QixZQUFZLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7eUJBQy9GLENBQUM7cUJBQ0g7a0xBR1EsS0FBSztzQkFBYixLQUFLO2dCQUNHLFFBQVE7c0JBQWhCLEtBQUs7Z0JBQ0csYUFBYTtzQkFBckIsS0FBSztnQkFDRyxLQUFLO3NCQUFiLEtBQUs7Z0JBQ0csYUFBYTtzQkFBckIsS0FBSztnQkFDRyxLQUFLO3NCQUFiLEtBQUs7Z0JBQ0csZUFBZTtzQkFBdkIsS0FBSztnQkFDRyxVQUFVO3NCQUFsQixLQUFLO2dCQUNHLGFBQWE7c0JBQXJCLEtBQUs7Z0JBQ0csYUFBYTtzQkFBckIsS0FBSztnQkFDRyxTQUFTO3NCQUFqQixLQUFLO2dCQUNHLFlBQVk7c0JBQXBCLEtBQUs7Z0JBQ0csWUFBWTtzQkFBcEIsS0FBSztnQkFDRyxjQUFjO3NCQUF0QixLQUFLO2dCQUNHLFdBQVc7c0JBQW5CLEtBQUs7Z0JBQ0csVUFBVTtzQkFBbEIsS0FBSztnQkFDRyxTQUFTO3NCQUFqQixLQUFLO2dCQUNHLFlBQVk7c0JBQXBCLEtBQUs7Z0JBQ0csWUFBWTtzQkFBcEIsS0FBSztnQkFDRyxRQUFRO3NCQUFoQixLQUFLO2dCQUNHLFNBQVM7c0JBQWpCLEtBQUs7Z0JBQ0csT0FBTztzQkFBZixLQUFLO2dCQUNHLFVBQVU7c0JBQWxCLEtBQUs7Z0JBQ0csT0FBTztzQkFBZixLQUFLO2dCQUNHLE9BQU87c0JBQWYsS0FBSztnQkFDRyxVQUFVO3NCQUFsQixLQUFLO2dCQUNHLFVBQVU7c0JBQWxCLEtBQUs7Z0JBQ0csTUFBTTtzQkFBZCxLQUFLO2dCQUNHLGNBQWM7c0JBQXRCLEtBQUs7Z0JBQ0cscUJBQXFCO3NCQUE3QixLQUFLO2dCQUNHLFdBQVc7c0JBQW5CLEtBQUs7Z0JBQ0csZUFBZTtzQkFBdkIsS0FBSztnQkFDRyxnQkFBZ0I7c0JBQXhCLEtBQUs7Z0JBQ0csZUFBZTtzQkFBdkIsS0FBSztnQkFDRyxJQUFJO3NCQUFaLEtBQUs7Z0JBQ0csTUFBTTtzQkFBZCxLQUFLO2dCQUNHLFlBQVk7c0JBQXBCLEtBQUs7Z0JBQ0csVUFBVTtzQkFBbEIsS0FBSztnQkFDRyx5QkFBeUI7c0JBQWpDLEtBQUs7Z0JBQ0csMkJBQTJCO3NCQUFuQyxLQUFLO2dCQUNHLHdCQUF3QjtzQkFBaEMsS0FBSztnQkFFSSxNQUFNO3NCQUFmLE1BQU07Z0JBQ0csUUFBUTtzQkFBakIsTUFBTTtnQkFDRyxVQUFVO3NCQUFuQixNQUFNO2dCQUNHLFVBQVU7c0JBQW5CLE1BQU07Z0JBQ0csWUFBWTtzQkFBckIsTUFBTTtnQkFDRyxXQUFXO3NCQUFwQixNQUFNO2dCQUV1QixZQUFZO3NCQUF6QyxZQUFZO3VCQUFDLGNBQWM7Z0JBQ0UsWUFBWTtzQkFBekMsWUFBWTt1QkFBQyxjQUFjO2dCQUNLLGVBQWU7c0JBQS9DLFlBQVk7dUJBQUMsaUJBQWlCO2dCQUNELFlBQVk7c0JBQXpDLFlBQVk7dUJBQUMsY0FBYztnQkFDUyxtQkFBbUI7c0JBQXZELFlBQVk7dUJBQUMscUJBQXFCO2dCQUVOLFlBQVk7c0JBQXhDLFlBQVk7dUJBQUMsYUFBYTtnQkFDRSxZQUFZO3NCQUF4QyxZQUFZO3VCQUFDLGFBQWE7Z0JBNEMzQixjQUFjO3NCQURiLEtBQUs7Z0JBY0YsU0FBUztzQkFEWixLQUFLO3VCQUFDLFdBQVc7Z0JBZ0JkLFVBQVU7c0JBRGIsS0FBSzt1QkFBQyxZQUFZO2dCQWdCZixVQUFVO3NCQURiLEtBQUs7dUJBQUMsWUFBWTtnQkFnWm5CLGFBQWEsTUFzYWIsV0FBVztzQkFEVixZQUFZO3VCQUFDLG9CQUFvQixFQUFFLENBQUMsUUFBUSxDQUFDO2dCQVc5QyxXQUFXO3NCQURWLFlBQVk7dUJBQUMsb0JBQW9CLEVBQUUsQ0FBQyxRQUFRLENBQUM7Z0JBTTlDLFVBQVU7c0JBRFQsWUFBWTt1QkFBQyxnQkFBZ0IsRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkFzQjFDLFdBQVc7c0JBRFYsWUFBWTt1QkFBQyxvQkFBb0IsRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkE2QjlDLFNBQVM7c0JBRFIsWUFBWTt1QkFBQyxrQkFBa0IsRUFBRSxDQUFDLFFBQVEsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIHJlbmFtZSB0cmFuc2l0aW9uIGR1ZSB0byBjb25mbGljdCB3aXRoIGQzIHRyYW5zaXRpb25cbmltcG9ydCB7IGFuaW1hdGUsIHN0eWxlLCB0cmFuc2l0aW9uIGFzIG5nVHJhbnNpdGlvbiwgdHJpZ2dlciB9IGZyb20gJ0Bhbmd1bGFyL2FuaW1hdGlvbnMnO1xuaW1wb3J0IHtcbiAgQWZ0ZXJWaWV3SW5pdCxcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksXG4gIENvbXBvbmVudCxcbiAgQ29udGVudENoaWxkLFxuICBFbGVtZW50UmVmLFxuICBFdmVudEVtaXR0ZXIsXG4gIEhvc3RMaXN0ZW5lcixcbiAgSW5wdXQsXG4gIE9uRGVzdHJveSxcbiAgT25Jbml0LFxuICBPdXRwdXQsXG4gIFF1ZXJ5TGlzdCxcbiAgVGVtcGxhdGVSZWYsXG4gIFZpZXdDaGlsZHJlbixcbiAgVmlld0VuY2Fwc3VsYXRpb24sXG4gIE5nWm9uZSxcbiAgQ2hhbmdlRGV0ZWN0b3JSZWYsXG4gIE9uQ2hhbmdlcyxcbiAgU2ltcGxlQ2hhbmdlc1xufSBmcm9tICdAYW5ndWxhci9jb3JlJztcbmltcG9ydCB7IHNlbGVjdCB9IGZyb20gJ2QzLXNlbGVjdGlvbic7XG5pbXBvcnQgKiBhcyBzaGFwZSBmcm9tICdkMy1zaGFwZSc7XG5pbXBvcnQgKiBhcyBlYXNlIGZyb20gJ2QzLWVhc2UnO1xuaW1wb3J0ICdkMy10cmFuc2l0aW9uJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YnNjcmlwdGlvbiwgb2YsIGZyb21FdmVudCBhcyBvYnNlcnZhYmxlRnJvbUV2ZW50LCBTdWJqZWN0IH0gZnJvbSAncnhqcyc7XG5pbXBvcnQgeyBmaXJzdCwgZGVib3VuY2VUaW1lLCB0YWtlVW50aWwgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQgeyBpZGVudGl0eSwgc2NhbGUsIHNtb290aE1hdHJpeCwgdG9TVkcsIHRyYW5zZm9ybSwgdHJhbnNsYXRlIH0gZnJvbSAndHJhbnNmb3JtYXRpb24tbWF0cml4JztcbmltcG9ydCB7IExheW91dCB9IGZyb20gJy4uL21vZGVscy9sYXlvdXQubW9kZWwnO1xuaW1wb3J0IHsgTGF5b3V0U2VydmljZSB9IGZyb20gJy4vbGF5b3V0cy9sYXlvdXQuc2VydmljZSc7XG5pbXBvcnQgeyBFZGdlIH0gZnJvbSAnLi4vbW9kZWxzL2VkZ2UubW9kZWwnO1xuaW1wb3J0IHsgTm9kZSwgQ2x1c3Rlck5vZGUsIENvbXBvdW5kTm9kZSB9IGZyb20gJy4uL21vZGVscy9ub2RlLm1vZGVsJztcbmltcG9ydCB7IEdyYXBoIH0gZnJvbSAnLi4vbW9kZWxzL2dyYXBoLm1vZGVsJztcbmltcG9ydCB7IGlkIH0gZnJvbSAnLi4vdXRpbHMvaWQnO1xuaW1wb3J0IHsgUGFubmluZ0F4aXMgfSBmcm9tICcuLi9lbnVtcy9wYW5uaW5nLmVudW0nO1xuaW1wb3J0IHsgTWluaU1hcFBvc2l0aW9uIH0gZnJvbSAnLi4vZW51bXMvbWluaS1tYXAtcG9zaXRpb24uZW51bSc7XG5pbXBvcnQgeyB0aHJvdHRsZWFibGUgfSBmcm9tICcuLi91dGlscy90aHJvdHRsZSc7XG5pbXBvcnQgeyBDb2xvckhlbHBlciB9IGZyb20gJy4uL3V0aWxzL2NvbG9yLmhlbHBlcic7XG5pbXBvcnQgeyBWaWV3RGltZW5zaW9ucywgY2FsY3VsYXRlVmlld0RpbWVuc2lvbnMgfSBmcm9tICcuLi91dGlscy92aWV3LWRpbWVuc2lvbnMuaGVscGVyJztcbmltcG9ydCB7IFZpc2liaWxpdHlPYnNlcnZlciB9IGZyb20gJy4uL3V0aWxzL3Zpc2liaWxpdHktb2JzZXJ2ZXInO1xuXG4vKipcbiAqIE1hdHJpeFxuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hdHJpeCB7XG4gIGE6IG51bWJlcjtcbiAgYjogbnVtYmVyO1xuICBjOiBudW1iZXI7XG4gIGQ6IG51bWJlcjtcbiAgZTogbnVtYmVyO1xuICBmOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmd4R3JhcGhab29tT3B0aW9ucyB7XG4gIGF1dG9DZW50ZXI/OiBib29sZWFuO1xuICBmb3JjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBlbnVtIE5neEdyYXBoU3RhdGVzIHtcbiAgSW5pdCA9ICdpbml0JyxcbiAgU3Vic2NyaWJlID0gJ3N1YnNjcmliZScsXG4gIFRyYW5zZm9ybSA9ICd0cmFuc2Zvcm0nXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmd4R3JhcGhTdGF0ZUNoYW5nZUV2ZW50IHtcbiAgc3RhdGU6IE5neEdyYXBoU3RhdGVzO1xufVxuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICduZ3gtZ3JhcGgnLFxuICBzdHlsZVVybHM6IFsnLi9ncmFwaC5jb21wb25lbnQuc2NzcyddLFxuICB0ZW1wbGF0ZVVybDogJ2dyYXBoLmNvbXBvbmVudC5odG1sJyxcbiAgZW5jYXBzdWxhdGlvbjogVmlld0VuY2Fwc3VsYXRpb24uTm9uZSxcbiAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2gsXG4gIGFuaW1hdGlvbnM6IFtcbiAgICB0cmlnZ2VyKCdhbmltYXRpb25TdGF0ZScsIFtcbiAgICAgIG5nVHJhbnNpdGlvbignOmVudGVyJywgW3N0eWxlKHsgb3BhY2l0eTogMCB9KSwgYW5pbWF0ZSgnNTAwbXMgMTAwbXMnLCBzdHlsZSh7IG9wYWNpdHk6IDEgfSkpXSlcbiAgICBdKVxuICBdXG59KVxuZXhwb3J0IGNsYXNzIEdyYXBoQ29tcG9uZW50IGltcGxlbWVudHMgT25Jbml0LCBPbkNoYW5nZXMsIE9uRGVzdHJveSwgQWZ0ZXJWaWV3SW5pdCB7XG4gIEBJbnB1dCgpIG5vZGVzOiBOb2RlW10gPSBbXTtcbiAgQElucHV0KCkgY2x1c3RlcnM6IENsdXN0ZXJOb2RlW10gPSBbXTtcbiAgQElucHV0KCkgY29tcG91bmROb2RlczogQ29tcG91bmROb2RlW10gPSBbXTtcbiAgQElucHV0KCkgbGlua3M6IEVkZ2VbXSA9IFtdO1xuICBASW5wdXQoKSBhY3RpdmVFbnRyaWVzOiBhbnlbXSA9IFtdO1xuICBASW5wdXQoKSBjdXJ2ZTogYW55O1xuICBASW5wdXQoKSBkcmFnZ2luZ0VuYWJsZWQgPSB0cnVlO1xuICBASW5wdXQoKSBub2RlSGVpZ2h0OiBudW1iZXI7XG4gIEBJbnB1dCgpIG5vZGVNYXhIZWlnaHQ6IG51bWJlcjtcbiAgQElucHV0KCkgbm9kZU1pbkhlaWdodDogbnVtYmVyO1xuICBASW5wdXQoKSBub2RlV2lkdGg6IG51bWJlcjtcbiAgQElucHV0KCkgbm9kZU1pbldpZHRoOiBudW1iZXI7XG4gIEBJbnB1dCgpIG5vZGVNYXhXaWR0aDogbnVtYmVyO1xuICBASW5wdXQoKSBwYW5uaW5nRW5hYmxlZDogYm9vbGVhbiA9IHRydWU7XG4gIEBJbnB1dCgpIHBhbm5pbmdBeGlzOiBQYW5uaW5nQXhpcyA9IFBhbm5pbmdBeGlzLkJvdGg7XG4gIEBJbnB1dCgpIGVuYWJsZVpvb20gPSB0cnVlO1xuICBASW5wdXQoKSB6b29tU3BlZWQgPSAwLjE7XG4gIEBJbnB1dCgpIG1pblpvb21MZXZlbCA9IDAuMTtcbiAgQElucHV0KCkgbWF4Wm9vbUxldmVsID0gNC4wO1xuICBASW5wdXQoKSBhdXRvWm9vbSA9IGZhbHNlO1xuICBASW5wdXQoKSBwYW5Pblpvb20gPSB0cnVlO1xuICBASW5wdXQoKSBhbmltYXRlPyA9IGZhbHNlO1xuICBASW5wdXQoKSBhdXRvQ2VudGVyID0gZmFsc2U7XG4gIEBJbnB1dCgpIHVwZGF0ZSQ6IE9ic2VydmFibGU8YW55PjtcbiAgQElucHV0KCkgY2VudGVyJDogT2JzZXJ2YWJsZTxhbnk+O1xuICBASW5wdXQoKSB6b29tVG9GaXQkOiBPYnNlcnZhYmxlPE5neEdyYXBoWm9vbU9wdGlvbnM+O1xuICBASW5wdXQoKSBwYW5Ub05vZGUkOiBPYnNlcnZhYmxlPGFueT47XG4gIEBJbnB1dCgpIGxheW91dDogc3RyaW5nIHwgTGF5b3V0O1xuICBASW5wdXQoKSBsYXlvdXRTZXR0aW5nczogYW55O1xuICBASW5wdXQoKSBlbmFibGVUcmFja3BhZFN1cHBvcnQgPSBmYWxzZTtcbiAgQElucHV0KCkgc2hvd01pbmlNYXA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgQElucHV0KCkgbWluaU1hcE1heFdpZHRoOiBudW1iZXIgPSAxMDA7XG4gIEBJbnB1dCgpIG1pbmlNYXBNYXhIZWlnaHQ6IG51bWJlcjtcbiAgQElucHV0KCkgbWluaU1hcFBvc2l0aW9uOiBNaW5pTWFwUG9zaXRpb24gPSBNaW5pTWFwUG9zaXRpb24uVXBwZXJSaWdodDtcbiAgQElucHV0KCkgdmlldzogW251bWJlciwgbnVtYmVyXTtcbiAgQElucHV0KCkgc2NoZW1lOiBhbnkgPSAnY29vbCc7XG4gIEBJbnB1dCgpIGN1c3RvbUNvbG9yczogYW55O1xuICBASW5wdXQoKSBhbmltYXRpb25zOiBib29sZWFuID0gdHJ1ZTtcbiAgQElucHV0KCkgZGVmZXJEaXNwbGF5VW50aWxQb3NpdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuICBASW5wdXQoKSBjZW50ZXJOb2Rlc09uUG9zaXRpb25DaGFuZ2UgPSB0cnVlO1xuICBASW5wdXQoKSBlbmFibGVQcmVVcGRhdGVUcmFuc2Zvcm0gPSB0cnVlO1xuXG4gIEBPdXRwdXQoKSBzZWxlY3QgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG4gIEBPdXRwdXQoKSBhY3RpdmF0ZTogRXZlbnRFbWl0dGVyPGFueT4gPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG4gIEBPdXRwdXQoKSBkZWFjdGl2YXRlOiBFdmVudEVtaXR0ZXI8YW55PiA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgQE91dHB1dCgpIHpvb21DaGFuZ2U6IEV2ZW50RW1pdHRlcjxudW1iZXI+ID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuICBAT3V0cHV0KCkgY2xpY2tIYW5kbGVyOiBFdmVudEVtaXR0ZXI8TW91c2VFdmVudD4gPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG4gIEBPdXRwdXQoKSBzdGF0ZUNoYW5nZTogRXZlbnRFbWl0dGVyPE5neEdyYXBoU3RhdGVDaGFuZ2VFdmVudD4gPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cbiAgQENvbnRlbnRDaGlsZCgnbGlua1RlbXBsYXRlJykgbGlua1RlbXBsYXRlOiBUZW1wbGF0ZVJlZjxhbnk+O1xuICBAQ29udGVudENoaWxkKCdub2RlVGVtcGxhdGUnKSBub2RlVGVtcGxhdGU6IFRlbXBsYXRlUmVmPGFueT47XG4gIEBDb250ZW50Q2hpbGQoJ2NsdXN0ZXJUZW1wbGF0ZScpIGNsdXN0ZXJUZW1wbGF0ZTogVGVtcGxhdGVSZWY8YW55PjtcbiAgQENvbnRlbnRDaGlsZCgnZGVmc1RlbXBsYXRlJykgZGVmc1RlbXBsYXRlOiBUZW1wbGF0ZVJlZjxhbnk+O1xuICBAQ29udGVudENoaWxkKCdtaW5pTWFwTm9kZVRlbXBsYXRlJykgbWluaU1hcE5vZGVUZW1wbGF0ZTogVGVtcGxhdGVSZWY8YW55PjtcblxuICBAVmlld0NoaWxkcmVuKCdub2RlRWxlbWVudCcpIG5vZGVFbGVtZW50czogUXVlcnlMaXN0PEVsZW1lbnRSZWY+O1xuICBAVmlld0NoaWxkcmVuKCdsaW5rRWxlbWVudCcpIGxpbmtFbGVtZW50czogUXVlcnlMaXN0PEVsZW1lbnRSZWY+O1xuXG4gIHB1YmxpYyBjaGFydFdpZHRoOiBhbnk7XG5cbiAgcHJpdmF0ZSBpc01vdXNlTW92ZUNhbGxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIGdyYXBoU3Vic2NyaXB0aW9uOiBTdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKCk7XG4gIGNvbG9yczogQ29sb3JIZWxwZXI7XG4gIGRpbXM6IFZpZXdEaW1lbnNpb25zO1xuICBzZXJpZXNEb21haW46IGFueTtcbiAgdHJhbnNmb3JtOiBzdHJpbmc7XG4gIGlzUGFubmluZyA9IGZhbHNlO1xuICBpc0RyYWdnaW5nID0gZmFsc2U7XG4gIGRyYWdnaW5nTm9kZTogTm9kZTtcbiAgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgZ3JhcGg6IEdyYXBoO1xuICBncmFwaERpbXM6IGFueSA9IHsgd2lkdGg6IDAsIGhlaWdodDogMCB9O1xuICBfb2xkTGlua3M6IEVkZ2VbXSA9IFtdO1xuICBvbGROb2RlczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG4gIG9sZENsdXN0ZXJzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcbiAgb2xkQ29tcG91bmROb2RlczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG4gIHRyYW5zZm9ybWF0aW9uTWF0cml4OiBNYXRyaXggPSBpZGVudGl0eSgpO1xuICBfdG91Y2hMYXN0WCA9IG51bGw7XG4gIF90b3VjaExhc3RZID0gbnVsbDtcbiAgbWluaW1hcFNjYWxlQ29lZmZpY2llbnQ6IG51bWJlciA9IDM7XG4gIG1pbmltYXBUcmFuc2Zvcm06IHN0cmluZztcbiAgbWluaW1hcE9mZnNldFg6IG51bWJlciA9IDA7XG4gIG1pbmltYXBPZmZzZXRZOiBudW1iZXIgPSAwO1xuICBpc01pbmltYXBQYW5uaW5nID0gZmFsc2U7XG4gIG1pbmltYXBDbGlwUGF0aElkOiBzdHJpbmc7XG4gIHdpZHRoOiBudW1iZXI7XG4gIGhlaWdodDogbnVtYmVyO1xuICByZXNpemVTdWJzY3JpcHRpb246IGFueTtcbiAgdmlzaWJpbGl0eU9ic2VydmVyOiBWaXNpYmlsaXR5T2JzZXJ2ZXI7XG4gIHByaXZhdGUgZGVzdHJveSQgPSBuZXcgU3ViamVjdDx2b2lkPigpO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgZWw6IEVsZW1lbnRSZWYsXG4gICAgcHVibGljIHpvbmU6IE5nWm9uZSxcbiAgICBwdWJsaWMgY2Q6IENoYW5nZURldGVjdG9yUmVmLFxuICAgIHByaXZhdGUgbGF5b3V0U2VydmljZTogTGF5b3V0U2VydmljZVxuICApIHt9XG5cbiAgQElucHV0KClcbiAgZ3JvdXBSZXN1bHRzQnk6IChub2RlOiBhbnkpID0+IHN0cmluZyA9IG5vZGUgPT4gbm9kZS5sYWJlbDtcblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IHpvb20gbGV2ZWxcbiAgICovXG4gIGdldCB6b29tTGV2ZWwoKSB7XG4gICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtYXRpb25NYXRyaXguYTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIGN1cnJlbnQgem9vbSBsZXZlbFxuICAgKi9cbiAgQElucHV0KCd6b29tTGV2ZWwnKVxuICBzZXQgem9vbUxldmVsKGxldmVsKSB7XG4gICAgdGhpcy56b29tVG8oTnVtYmVyKGxldmVsKSk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IGB4YCBwb3NpdGlvbiBvZiB0aGUgZ3JhcGhcbiAgICovXG4gIGdldCBwYW5PZmZzZXRYKCkge1xuICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4LmU7XG4gIH1cblxuICAvKipcbiAgICogU2V0IHRoZSBjdXJyZW50IGB4YCBwb3NpdGlvbiBvZiB0aGUgZ3JhcGhcbiAgICovXG4gIEBJbnB1dCgncGFuT2Zmc2V0WCcpXG4gIHNldCBwYW5PZmZzZXRYKHgpIHtcbiAgICB0aGlzLnBhblRvKE51bWJlcih4KSwgbnVsbCk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IGB5YCBwb3NpdGlvbiBvZiB0aGUgZ3JhcGhcbiAgICovXG4gIGdldCBwYW5PZmZzZXRZKCkge1xuICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4LmY7XG4gIH1cblxuICAvKipcbiAgICogU2V0IHRoZSBjdXJyZW50IGB5YCBwb3NpdGlvbiBvZiB0aGUgZ3JhcGhcbiAgICovXG4gIEBJbnB1dCgncGFuT2Zmc2V0WScpXG4gIHNldCBwYW5PZmZzZXRZKHkpIHtcbiAgICB0aGlzLnBhblRvKG51bGwsIE51bWJlcih5KSk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZUNvdW50ID0gMDtcblxuICAvKipcbiAgICogQW5ndWxhciBsaWZlY3ljbGUgZXZlbnRcbiAgICpcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBuZ09uSW5pdCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy51cGRhdGUkKSB7XG4gICAgICB0aGlzLnVwZGF0ZSQucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jZW50ZXIkKSB7XG4gICAgICB0aGlzLmNlbnRlciQucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgIHRoaXMuY2VudGVyKCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy56b29tVG9GaXQkKSB7XG4gICAgICB0aGlzLnpvb21Ub0ZpdCQucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpLnN1YnNjcmliZShvcHRpb25zID0+IHtcbiAgICAgICAgdGhpcy56b29tVG9GaXQob3B0aW9ucyA/IG9wdGlvbnMgOiB7fSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5wYW5Ub05vZGUkKSB7XG4gICAgICB0aGlzLnBhblRvTm9kZSQucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpLnN1YnNjcmliZSgobm9kZUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgdGhpcy5wYW5Ub05vZGVJZChub2RlSWQpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5taW5pbWFwQ2xpcFBhdGhJZCA9IGBtaW5pbWFwQ2xpcCR7aWQoKX1gO1xuICAgIHRoaXMuc3RhdGVDaGFuZ2UuZW1pdCh7IHN0YXRlOiBOZ3hHcmFwaFN0YXRlcy5TdWJzY3JpYmUgfSk7XG4gIH1cblxuICBuZ09uQ2hhbmdlcyhjaGFuZ2VzOiBTaW1wbGVDaGFuZ2VzKTogdm9pZCB7XG4gICAgdGhpcy5iYXNpY1VwZGF0ZSgpO1xuXG4gICAgY29uc3QgeyBsYXlvdXQsIGxheW91dFNldHRpbmdzLCBub2RlcywgY2x1c3RlcnMsIGxpbmtzLCBjb21wb3VuZE5vZGVzIH0gPSBjaGFuZ2VzO1xuICAgIHRoaXMuc2V0TGF5b3V0KHRoaXMubGF5b3V0KTtcbiAgICBpZiAobGF5b3V0U2V0dGluZ3MpIHtcbiAgICAgIHRoaXMuc2V0TGF5b3V0U2V0dGluZ3ModGhpcy5sYXlvdXRTZXR0aW5ncyk7XG4gICAgfVxuICAgIHRoaXMudXBkYXRlKCk7XG4gIH1cblxuICBzZXRMYXlvdXQobGF5b3V0OiBzdHJpbmcgfCBMYXlvdXQpOiB2b2lkIHtcbiAgICB0aGlzLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgaWYgKCFsYXlvdXQpIHtcbiAgICAgIGxheW91dCA9ICdkYWdyZSc7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgbGF5b3V0ID09PSAnc3RyaW5nJykge1xuICAgICAgdGhpcy5sYXlvdXQgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0TGF5b3V0KGxheW91dCk7XG4gICAgICB0aGlzLnNldExheW91dFNldHRpbmdzKHRoaXMubGF5b3V0U2V0dGluZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHNldExheW91dFNldHRpbmdzKHNldHRpbmdzOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5sYXlvdXQgJiYgdHlwZW9mIHRoaXMubGF5b3V0ICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhpcy5sYXlvdXQuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQW5ndWxhciBsaWZlY3ljbGUgZXZlbnRcbiAgICpcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBuZ09uRGVzdHJveSgpOiB2b2lkIHtcbiAgICB0aGlzLnVuYmluZEV2ZW50cygpO1xuICAgIGlmICh0aGlzLnZpc2liaWxpdHlPYnNlcnZlcikge1xuICAgICAgdGhpcy52aXNpYmlsaXR5T2JzZXJ2ZXIudmlzaWJsZS51bnN1YnNjcmliZSgpO1xuICAgICAgdGhpcy52aXNpYmlsaXR5T2JzZXJ2ZXIuZGVzdHJveSgpO1xuICAgIH1cbiAgICB0aGlzLmRlc3Ryb3kkLm5leHQoKTtcbiAgICB0aGlzLmRlc3Ryb3kkLmNvbXBsZXRlKCk7XG4gIH1cblxuICAvKipcbiAgICogQW5ndWxhciBsaWZlY3ljbGUgZXZlbnRcbiAgICpcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBuZ0FmdGVyVmlld0luaXQoKTogdm9pZCB7XG4gICAgdGhpcy5iaW5kV2luZG93UmVzaXplRXZlbnQoKTtcblxuICAgIC8vIGxpc3RlbiBmb3IgdmlzaWJpbGl0eSBvZiB0aGUgZWxlbWVudCBmb3IgaGlkZGVuIGJ5IGRlZmF1bHQgc2NlbmFyaW9cbiAgICB0aGlzLnZpc2liaWxpdHlPYnNlcnZlciA9IG5ldyBWaXNpYmlsaXR5T2JzZXJ2ZXIodGhpcy5lbCwgdGhpcy56b25lKTtcbiAgICB0aGlzLnZpc2liaWxpdHlPYnNlcnZlci52aXNpYmxlLnN1YnNjcmliZSh0aGlzLnVwZGF0ZS5iaW5kKHRoaXMpKTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy51cGRhdGUoKSk7XG4gIH1cblxuICAvKipcbiAgICogQmFzZSBjbGFzcyB1cGRhdGUgaW1wbGVtZW50YXRpb24gZm9yIHRoZSBkYWcgZ3JhcGhcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICB1cGRhdGUoKTogdm9pZCB7XG4gICAgdGhpcy5iYXNpY1VwZGF0ZSgpO1xuICAgIGlmICghdGhpcy5jdXJ2ZSkge1xuICAgICAgdGhpcy5jdXJ2ZSA9IHNoYXBlLmN1cnZlQnVuZGxlLmJldGEoMSk7XG4gICAgfVxuXG4gICAgdGhpcy56b25lLnJ1bigoKSA9PiB7XG4gICAgICB0aGlzLmRpbXMgPSBjYWxjdWxhdGVWaWV3RGltZW5zaW9ucyh7XG4gICAgICAgIHdpZHRoOiB0aGlzLndpZHRoLFxuICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5zZXJpZXNEb21haW4gPSB0aGlzLmdldFNlcmllc0RvbWFpbigpO1xuICAgICAgdGhpcy5zZXRDb2xvcnMoKTtcblxuICAgICAgdGhpcy5jcmVhdGVHcmFwaCgpO1xuICAgICAgdGhpcy51cGRhdGVUcmFuc2Zvcm0oKTtcbiAgICAgIGlmICghdGhpcy5pbml0aWFsaXplZCkge1xuICAgICAgICB0aGlzLnN0YXRlQ2hhbmdlLmVtaXQoeyBzdGF0ZTogTmd4R3JhcGhTdGF0ZXMuSW5pdCB9KTtcbiAgICAgIH1cbiAgICAgIHRoaXMuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIHRoaXMudXBkYXRlQ291bnQrKztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIHRoZSBkYWdyZSBncmFwaCBlbmdpbmVcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBjcmVhdGVHcmFwaCgpOiB2b2lkIHtcbiAgICB0aGlzLmdyYXBoU3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XG4gICAgdGhpcy5ncmFwaFN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oKTtcbiAgICBjb25zdCBpbml0aWFsaXplTm9kZSA9IChuOiBOb2RlKSA9PiB7XG4gICAgICBpZiAoIW4ubWV0YSkge1xuICAgICAgICBuLm1ldGEgPSB7fTtcbiAgICAgIH1cbiAgICAgIGlmICghbi5pZCkge1xuICAgICAgICBuLmlkID0gaWQoKTtcbiAgICAgIH1cbiAgICAgIGlmICghbi5kaW1lbnNpb24pIHtcbiAgICAgICAgbi5kaW1lbnNpb24gPSB7XG4gICAgICAgICAgd2lkdGg6IHRoaXMubm9kZVdpZHRoID8gdGhpcy5ub2RlV2lkdGggOiAzMCxcbiAgICAgICAgICBoZWlnaHQ6IHRoaXMubm9kZUhlaWdodCA/IHRoaXMubm9kZUhlaWdodCA6IDMwXG4gICAgICAgIH07XG4gICAgICAgIG4ubWV0YS5mb3JjZURpbWVuc2lvbnMgPSBmYWxzZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG4ubWV0YS5mb3JjZURpbWVuc2lvbnMgPSBuLm1ldGEuZm9yY2VEaW1lbnNpb25zID09PSB1bmRlZmluZWQgPyB0cnVlIDogbi5tZXRhLmZvcmNlRGltZW5zaW9ucztcbiAgICAgIH1cbiAgICAgIGlmICghbi5wb3NpdGlvbikge1xuICAgICAgICBuLnBvc2l0aW9uID0ge1xuICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgeTogMFxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5kZWZlckRpc3BsYXlVbnRpbFBvc2l0aW9uKSB7XG4gICAgICAgICAgbi5oaWRkZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXMudXBkYXRlQ291bnQgPT0gMCAmJiBuLmRhdGE/LmRhdGE/LnBvc2l0aW9uKXtcbiAgICAgICAgY29uc3QgcCA9IG4uZGF0YT8uZGF0YT8ucG9zaXRpb247XG4gICAgICAgIGNvbnNvbGUubG9nKFwic2V0dGluZyB1cCBwb3NpdGlvbiBmb3IgZmlyc3QgdGltZTogXCIsIHApO1xuICAgICAgICBuLnBvc2l0aW9uID0ge3g6IHAueCwgeTogcC55fTtcbiAgICAgIH1cblxuICAgICAgbi5kYXRhID0gbi5kYXRhID8gbi5kYXRhIDoge307XG4gICAgICByZXR1cm4gbjtcbiAgICB9O1xuXG4gICAgdGhpcy5ncmFwaCA9IHtcbiAgICAgIG5vZGVzOiB0aGlzLm5vZGVzLmxlbmd0aCA+IDAgPyBbLi4udGhpcy5ub2Rlc10ubWFwKGluaXRpYWxpemVOb2RlKSA6IFtdLFxuICAgICAgY2x1c3RlcnM6IHRoaXMuY2x1c3RlcnMgJiYgdGhpcy5jbHVzdGVycy5sZW5ndGggPiAwID8gWy4uLnRoaXMuY2x1c3RlcnNdLm1hcChpbml0aWFsaXplTm9kZSkgOiBbXSxcbiAgICAgIGNvbXBvdW5kTm9kZXM6XG4gICAgICAgIHRoaXMuY29tcG91bmROb2RlcyAmJiB0aGlzLmNvbXBvdW5kTm9kZXMubGVuZ3RoID4gMCA/IFsuLi50aGlzLmNvbXBvdW5kTm9kZXNdLm1hcChpbml0aWFsaXplTm9kZSkgOiBbXSxcbiAgICAgIGVkZ2VzOlxuICAgICAgICB0aGlzLmxpbmtzLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IFsuLi50aGlzLmxpbmtzXS5tYXAoZSA9PiB7XG4gICAgICAgICAgICAgIGlmICghZS5pZCkge1xuICAgICAgICAgICAgICAgIGUuaWQgPSBpZCgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBlO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICA6IFtdXG4gICAgfTtcblxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmRyYXcoKSk7XG4gIH1cblxuICAvKipcbiAgICogRHJhd3MgdGhlIGdyYXBoIHVzaW5nIGRhZ3JlIGxheW91dHNcbiAgICpcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBkcmF3KCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5sYXlvdXQgfHwgdHlwZW9mIHRoaXMubGF5b3V0ID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBDYWxjIHZpZXcgZGltcyBmb3IgdGhlIG5vZGVzXG4gICAgdGhpcy5hcHBseU5vZGVEaW1lbnNpb25zKCk7XG5cbiAgICAvLyBSZWNhbGMgdGhlIGxheW91dFxuICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMubGF5b3V0LnJ1bih0aGlzLmdyYXBoKTtcbiAgICBjb25zdCByZXN1bHQkID0gcmVzdWx0IGluc3RhbmNlb2YgT2JzZXJ2YWJsZSA/IHJlc3VsdCA6IG9mKHJlc3VsdCk7XG4gICAgdGhpcy5ncmFwaFN1YnNjcmlwdGlvbi5hZGQoXG4gICAgICByZXN1bHQkLnN1YnNjcmliZShncmFwaCA9PiB7XG4gICAgICAgIHRoaXMuZ3JhcGggPSBncmFwaDtcbiAgICAgICAgdGhpcy50aWNrKCk7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICBpZiAodGhpcy5ncmFwaC5ub2Rlcy5sZW5ndGggPT09IDAgJiYgdGhpcy5ncmFwaC5jb21wb3VuZE5vZGVzPy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXN1bHQkLnBpcGUoZmlyc3QoKSkuc3Vic2NyaWJlKCgpID0+IHRoaXMuYXBwbHlOb2RlRGltZW5zaW9ucygpKTtcbiAgfVxuXG4gIHRpY2soKSB7XG4gICAgLy8gVHJhbnNwb3NlcyB2aWV3IG9wdGlvbnMgdG8gdGhlIG5vZGVcbiAgICBjb25zdCBvbGROb2RlczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cbiAgICB0aGlzLmdyYXBoLm5vZGVzLm1hcChuID0+IHtcbiAgICAgIG4udHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke24ucG9zaXRpb24ueCAtICh0aGlzLmNlbnRlck5vZGVzT25Qb3NpdGlvbkNoYW5nZSA/IG4uZGltZW5zaW9uLndpZHRoIC8gMiA6IDApIHx8IDB9LCAke1xuICAgICAgICBuLnBvc2l0aW9uLnkgLSAodGhpcy5jZW50ZXJOb2Rlc09uUG9zaXRpb25DaGFuZ2UgPyBuLmRpbWVuc2lvbi5oZWlnaHQgLyAyIDogMCkgfHwgMFxuICAgICAgfSlgO1xuICAgICAgaWYgKCFuLmRhdGEpIHtcbiAgICAgICAgbi5kYXRhID0ge307XG4gICAgICB9XG4gICAgICBuLmRhdGEuY29sb3IgPSB0aGlzLmNvbG9ycy5nZXRDb2xvcih0aGlzLmdyb3VwUmVzdWx0c0J5KG4pKTtcbiAgICAgIGlmICh0aGlzLmRlZmVyRGlzcGxheVVudGlsUG9zaXRpb24pIHtcbiAgICAgICAgbi5oaWRkZW4gPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIG9sZE5vZGVzLmFkZChuLmlkKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IG9sZENsdXN0ZXJzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCBvbGRDb21wb3VuZE5vZGVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuICAgICh0aGlzLmdyYXBoLmNsdXN0ZXJzIHx8IFtdKS5tYXAobiA9PiB7XG4gICAgICBuLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtuLnBvc2l0aW9uLnggLSAodGhpcy5jZW50ZXJOb2Rlc09uUG9zaXRpb25DaGFuZ2UgPyBuLmRpbWVuc2lvbi53aWR0aCAvIDIgOiAwKSB8fCAwfSwgJHtcbiAgICAgICAgbi5wb3NpdGlvbi55IC0gKHRoaXMuY2VudGVyTm9kZXNPblBvc2l0aW9uQ2hhbmdlID8gbi5kaW1lbnNpb24uaGVpZ2h0IC8gMiA6IDApIHx8IDBcbiAgICAgIH0pYDtcbiAgICAgIGlmICghbi5kYXRhKSB7XG4gICAgICAgIG4uZGF0YSA9IHt9O1xuICAgICAgfVxuICAgICAgbi5kYXRhLmNvbG9yID0gdGhpcy5jb2xvcnMuZ2V0Q29sb3IodGhpcy5ncm91cFJlc3VsdHNCeShuKSk7XG4gICAgICBpZiAodGhpcy5kZWZlckRpc3BsYXlVbnRpbFBvc2l0aW9uKSB7XG4gICAgICAgIG4uaGlkZGVuID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBvbGRDbHVzdGVycy5hZGQobi5pZCk7XG4gICAgfSk7XG5cbiAgICAodGhpcy5ncmFwaC5jb21wb3VuZE5vZGVzIHx8IFtdKS5tYXAobiA9PiB7XG4gICAgICBuLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtuLnBvc2l0aW9uLnggLSAodGhpcy5jZW50ZXJOb2Rlc09uUG9zaXRpb25DaGFuZ2UgPyBuLmRpbWVuc2lvbi53aWR0aCAvIDIgOiAwKSB8fCAwfSwgJHtcbiAgICAgICAgbi5wb3NpdGlvbi55IC0gKHRoaXMuY2VudGVyTm9kZXNPblBvc2l0aW9uQ2hhbmdlID8gbi5kaW1lbnNpb24uaGVpZ2h0IC8gMiA6IDApIHx8IDBcbiAgICAgIH0pYDtcbiAgICAgIGlmICghbi5kYXRhKSB7XG4gICAgICAgIG4uZGF0YSA9IHt9O1xuICAgICAgfVxuICAgICAgbi5kYXRhLmNvbG9yID0gdGhpcy5jb2xvcnMuZ2V0Q29sb3IodGhpcy5ncm91cFJlc3VsdHNCeShuKSk7XG4gICAgICBpZiAodGhpcy5kZWZlckRpc3BsYXlVbnRpbFBvc2l0aW9uKSB7XG4gICAgICAgIG4uaGlkZGVuID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBvbGRDb21wb3VuZE5vZGVzLmFkZChuLmlkKTtcbiAgICB9KTtcblxuICAgIC8vIFByZXZlbnQgYW5pbWF0aW9ucyBvbiBuZXcgbm9kZXNcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMub2xkTm9kZXMgPSBvbGROb2RlcztcbiAgICAgIHRoaXMub2xkQ2x1c3RlcnMgPSBvbGRDbHVzdGVycztcbiAgICAgIHRoaXMub2xkQ29tcG91bmROb2RlcyA9IG9sZENvbXBvdW5kTm9kZXM7XG4gICAgfSwgNTAwKTtcblxuICAgIC8vIFVwZGF0ZSB0aGUgbGFiZWxzIHRvIHRoZSBuZXcgcG9zaXRpb25zXG4gICAgY29uc3QgbmV3TGlua3MgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGVkZ2VMYWJlbElkIGluIHRoaXMuZ3JhcGguZWRnZUxhYmVscykge1xuICAgICAgY29uc3QgZWRnZUxhYmVsID0gdGhpcy5ncmFwaC5lZGdlTGFiZWxzW2VkZ2VMYWJlbElkXTtcblxuICAgICAgY29uc3Qgbm9ybUtleSA9IGVkZ2VMYWJlbElkLnJlcGxhY2UoL1teXFx3LV0qL2csICcnKTtcblxuICAgICAgY29uc3QgaXNNdWx0aWdyYXBoID1cbiAgICAgICAgdGhpcy5sYXlvdXQgJiYgdHlwZW9mIHRoaXMubGF5b3V0ICE9PSAnc3RyaW5nJyAmJiB0aGlzLmxheW91dC5zZXR0aW5ncyAmJiB0aGlzLmxheW91dC5zZXR0aW5ncy5tdWx0aWdyYXBoO1xuXG4gICAgICBsZXQgb2xkTGluayA9IGlzTXVsdGlncmFwaFxuICAgICAgICA/IHRoaXMuX29sZExpbmtzLmZpbmQob2wgPT4gYCR7b2wuc291cmNlfSR7b2wudGFyZ2V0fSR7b2wuaWR9YCA9PT0gbm9ybUtleSlcbiAgICAgICAgOiB0aGlzLl9vbGRMaW5rcy5maW5kKG9sID0+IGAke29sLnNvdXJjZX0ke29sLnRhcmdldH1gID09PSBub3JtS2V5KTtcblxuICAgICAgY29uc3QgbGlua0Zyb21HcmFwaCA9IGlzTXVsdGlncmFwaFxuICAgICAgICA/IHRoaXMuZ3JhcGguZWRnZXMuZmluZChubCA9PiBgJHtubC5zb3VyY2V9JHtubC50YXJnZXR9JHtubC5pZH1gID09PSBub3JtS2V5KVxuICAgICAgICA6IHRoaXMuZ3JhcGguZWRnZXMuZmluZChubCA9PiBgJHtubC5zb3VyY2V9JHtubC50YXJnZXR9YCA9PT0gbm9ybUtleSk7XG5cbiAgICAgIGlmICghb2xkTGluaykge1xuICAgICAgICBvbGRMaW5rID0gbGlua0Zyb21HcmFwaCB8fCBlZGdlTGFiZWw7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBvbGRMaW5rLmRhdGEgJiZcbiAgICAgICAgbGlua0Zyb21HcmFwaCAmJlxuICAgICAgICBsaW5rRnJvbUdyYXBoLmRhdGEgJiZcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkob2xkTGluay5kYXRhKSAhPT0gSlNPTi5zdHJpbmdpZnkobGlua0Zyb21HcmFwaC5kYXRhKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENvbXBhcmUgb2xkIGxpbmsgdG8gbmV3IGxpbmsgYW5kIHJlcGxhY2UgaWYgbm90IGVxdWFsXG4gICAgICAgIG9sZExpbmsuZGF0YSA9IGxpbmtGcm9tR3JhcGguZGF0YTtcbiAgICAgIH1cblxuICAgICAgb2xkTGluay5vbGRMaW5lID0gb2xkTGluay5saW5lO1xuXG4gICAgICBjb25zdCBwb2ludHMgPSBlZGdlTGFiZWwucG9pbnRzO1xuICAgICAgY29uc3QgbGluZSA9IHRoaXMuZ2VuZXJhdGVMaW5lKHBvaW50cyk7XG5cbiAgICAgIGNvbnN0IG5ld0xpbmsgPSBPYmplY3QuYXNzaWduKHt9LCBvbGRMaW5rKTtcbiAgICAgIG5ld0xpbmsubGluZSA9IGxpbmU7XG4gICAgICBuZXdMaW5rLnBvaW50cyA9IHBvaW50cztcblxuICAgICAgdGhpcy51cGRhdGVNaWRwb2ludE9uRWRnZShuZXdMaW5rLCBwb2ludHMpO1xuXG4gICAgICBjb25zdCB0ZXh0UG9zID0gcG9pbnRzW01hdGguZmxvb3IocG9pbnRzLmxlbmd0aCAvIDIpXTtcbiAgICAgIGlmICh0ZXh0UG9zKSB7XG4gICAgICAgIG5ld0xpbmsudGV4dFRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHt0ZXh0UG9zLnggfHwgMH0sJHt0ZXh0UG9zLnkgfHwgMH0pYDtcbiAgICAgIH1cblxuICAgICAgbmV3TGluay50ZXh0QW5nbGUgPSAwO1xuICAgICAgaWYgKCFuZXdMaW5rLm9sZExpbmUpIHtcbiAgICAgICAgbmV3TGluay5vbGRMaW5lID0gbmV3TGluay5saW5lO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmNhbGNEb21pbmFudEJhc2VsaW5lKG5ld0xpbmspO1xuICAgICAgbmV3TGlua3MucHVzaChuZXdMaW5rKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoLmVkZ2VzID0gbmV3TGlua3M7XG5cbiAgICAvLyBNYXAgdGhlIG9sZCBsaW5rcyBmb3IgYW5pbWF0aW9uc1xuICAgIGlmICh0aGlzLmdyYXBoLmVkZ2VzKSB7XG4gICAgICB0aGlzLl9vbGRMaW5rcyA9IHRoaXMuZ3JhcGguZWRnZXMubWFwKGwgPT4ge1xuICAgICAgICBjb25zdCBuZXdMID0gT2JqZWN0LmFzc2lnbih7fSwgbCk7XG4gICAgICAgIG5ld0wub2xkTGluZSA9IGwubGluZTtcbiAgICAgICAgcmV0dXJuIG5ld0w7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZU1pbmltYXAoKTtcblxuICAgIGlmICh0aGlzLmF1dG9ab29tKSB7XG4gICAgICB0aGlzLnpvb21Ub0ZpdCgpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmF1dG9DZW50ZXIpIHtcbiAgICAgIC8vIEF1dG8tY2VudGVyIHdoZW4gcmVuZGVyaW5nXG4gICAgICB0aGlzLmNlbnRlcigpO1xuICAgIH1cblxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLnJlZHJhd0xpbmVzKCkpO1xuICAgIHRoaXMuY2QubWFya0ZvckNoZWNrKCk7XG4gIH1cblxuICBnZXRNaW5pbWFwVHJhbnNmb3JtKCk6IHN0cmluZyB7XG4gICAgc3dpdGNoICh0aGlzLm1pbmlNYXBQb3NpdGlvbikge1xuICAgICAgY2FzZSBNaW5pTWFwUG9zaXRpb24uVXBwZXJMZWZ0OiB7XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIH1cbiAgICAgIGNhc2UgTWluaU1hcFBvc2l0aW9uLlVwcGVyUmlnaHQ6IHtcbiAgICAgICAgcmV0dXJuICd0cmFuc2xhdGUoJyArICh0aGlzLmRpbXMud2lkdGggLSB0aGlzLmdyYXBoRGltcy53aWR0aCAvIHRoaXMubWluaW1hcFNjYWxlQ29lZmZpY2llbnQpICsgJywnICsgMCArICcpJztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUdyYXBoRGltcygpIHtcbiAgICBsZXQgbWluWCA9ICtJbmZpbml0eTtcbiAgICBsZXQgbWF4WCA9IC1JbmZpbml0eTtcbiAgICBsZXQgbWluWSA9ICtJbmZpbml0eTtcbiAgICBsZXQgbWF4WSA9IC1JbmZpbml0eTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ncmFwaC5ub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgbm9kZSA9IHRoaXMuZ3JhcGgubm9kZXNbaV07XG4gICAgICBtaW5YID0gbm9kZS5wb3NpdGlvbi54IDwgbWluWCA/IG5vZGUucG9zaXRpb24ueCA6IG1pblg7XG4gICAgICBtaW5ZID0gbm9kZS5wb3NpdGlvbi55IDwgbWluWSA/IG5vZGUucG9zaXRpb24ueSA6IG1pblk7XG4gICAgICBtYXhYID0gbm9kZS5wb3NpdGlvbi54ICsgbm9kZS5kaW1lbnNpb24ud2lkdGggPiBtYXhYID8gbm9kZS5wb3NpdGlvbi54ICsgbm9kZS5kaW1lbnNpb24ud2lkdGggOiBtYXhYO1xuICAgICAgbWF4WSA9IG5vZGUucG9zaXRpb24ueSArIG5vZGUuZGltZW5zaW9uLmhlaWdodCA+IG1heFkgPyBub2RlLnBvc2l0aW9uLnkgKyBub2RlLmRpbWVuc2lvbi5oZWlnaHQgOiBtYXhZO1xuICAgIH1cbiAgICBtaW5YIC09IDEwMDtcbiAgICBtaW5ZIC09IDEwMDtcbiAgICBtYXhYICs9IDEwMDtcbiAgICBtYXhZICs9IDEwMDtcbiAgICB0aGlzLmdyYXBoRGltcy53aWR0aCA9IG1heFggLSBtaW5YO1xuICAgIHRoaXMuZ3JhcGhEaW1zLmhlaWdodCA9IG1heFkgLSBtaW5ZO1xuICAgIHRoaXMubWluaW1hcE9mZnNldFggPSBtaW5YO1xuICAgIHRoaXMubWluaW1hcE9mZnNldFkgPSBtaW5ZO1xuICB9XG5cbiAgQHRocm90dGxlYWJsZSg1MDApXG4gIHVwZGF0ZU1pbmltYXAoKSB7XG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBoZWlnaHQvd2lkdGggdG90YWwsIGJ1dCBvbmx5IGlmIHdlIGhhdmUgYW55IG5vZGVzXG4gICAgaWYgKHRoaXMuZ3JhcGgubm9kZXMgJiYgdGhpcy5ncmFwaC5ub2Rlcy5sZW5ndGgpIHtcbiAgICAgIHRoaXMudXBkYXRlR3JhcGhEaW1zKCk7XG5cbiAgICAgIGlmICh0aGlzLm1pbmlNYXBNYXhXaWR0aCkge1xuICAgICAgICB0aGlzLm1pbmltYXBTY2FsZUNvZWZmaWNpZW50ID0gdGhpcy5ncmFwaERpbXMud2lkdGggLyB0aGlzLm1pbmlNYXBNYXhXaWR0aDtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLm1pbmlNYXBNYXhIZWlnaHQpIHtcbiAgICAgICAgdGhpcy5taW5pbWFwU2NhbGVDb2VmZmljaWVudCA9IE1hdGgubWF4KFxuICAgICAgICAgIHRoaXMubWluaW1hcFNjYWxlQ29lZmZpY2llbnQsXG4gICAgICAgICAgdGhpcy5ncmFwaERpbXMuaGVpZ2h0IC8gdGhpcy5taW5pTWFwTWF4SGVpZ2h0XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubWluaW1hcFRyYW5zZm9ybSA9IHRoaXMuZ2V0TWluaW1hcFRyYW5zZm9ybSgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBNZWFzdXJlcyB0aGUgbm9kZSBlbGVtZW50IGFuZCBhcHBsaWVzIHRoZSBkaW1lbnNpb25zXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgYXBwbHlOb2RlRGltZW5zaW9ucygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5ub2RlRWxlbWVudHMgJiYgdGhpcy5ub2RlRWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICB0aGlzLm5vZGVFbGVtZW50cy5tYXAoZWxlbSA9PiB7XG4gICAgICAgIGNvbnN0IG5hdGl2ZUVsZW1lbnQgPSBlbGVtLm5hdGl2ZUVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IG5vZGUgPSB0aGlzLmdyYXBoLm5vZGVzLmZpbmQobiA9PiBuLmlkID09PSBuYXRpdmVFbGVtZW50LmlkKTtcbiAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIHRoZSBoZWlnaHRcbiAgICAgICAgbGV0IGRpbXM7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZGltcyA9IG5hdGl2ZUVsZW1lbnQuZ2V0QkJveCgpO1xuICAgICAgICAgIGlmICghZGltcy53aWR0aCB8fCAhZGltcy5oZWlnaHQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGV4KSB7XG4gICAgICAgICAgLy8gU2tpcCBkcmF3aW5nIGlmIGVsZW1lbnQgaXMgbm90IGRpc3BsYXllZCAtIEZpcmVmb3ggd291bGQgdGhyb3cgYW4gZXJyb3IgaGVyZVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5ub2RlSGVpZ2h0KSB7XG4gICAgICAgICAgbm9kZS5kaW1lbnNpb24uaGVpZ2h0ID1cbiAgICAgICAgICAgIG5vZGUuZGltZW5zaW9uLmhlaWdodCAmJiBub2RlLm1ldGEuZm9yY2VEaW1lbnNpb25zID8gbm9kZS5kaW1lbnNpb24uaGVpZ2h0IDogdGhpcy5ub2RlSGVpZ2h0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5vZGUuZGltZW5zaW9uLmhlaWdodCA9XG4gICAgICAgICAgICBub2RlLmRpbWVuc2lvbi5oZWlnaHQgJiYgbm9kZS5tZXRhLmZvcmNlRGltZW5zaW9ucyA/IG5vZGUuZGltZW5zaW9uLmhlaWdodCA6IGRpbXMuaGVpZ2h0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubm9kZU1heEhlaWdodCkge1xuICAgICAgICAgIG5vZGUuZGltZW5zaW9uLmhlaWdodCA9IE1hdGgubWF4KG5vZGUuZGltZW5zaW9uLmhlaWdodCwgdGhpcy5ub2RlTWF4SGVpZ2h0KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5ub2RlTWluSGVpZ2h0KSB7XG4gICAgICAgICAgbm9kZS5kaW1lbnNpb24uaGVpZ2h0ID0gTWF0aC5taW4obm9kZS5kaW1lbnNpb24uaGVpZ2h0LCB0aGlzLm5vZGVNaW5IZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubm9kZVdpZHRoKSB7XG4gICAgICAgICAgbm9kZS5kaW1lbnNpb24ud2lkdGggPVxuICAgICAgICAgICAgbm9kZS5kaW1lbnNpb24ud2lkdGggJiYgbm9kZS5tZXRhLmZvcmNlRGltZW5zaW9ucyA/IG5vZGUuZGltZW5zaW9uLndpZHRoIDogdGhpcy5ub2RlV2lkdGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gY2FsY3VsYXRlIHRoZSB3aWR0aFxuICAgICAgICAgIGlmIChuYXRpdmVFbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCd0ZXh0JykubGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgbWF4VGV4dERpbXM7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHRleHRFbGVtIG9mIG5hdGl2ZUVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3RleHQnKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRCQm94ID0gdGV4dEVsZW0uZ2V0QkJveCgpO1xuICAgICAgICAgICAgICAgIGlmICghbWF4VGV4dERpbXMpIHtcbiAgICAgICAgICAgICAgICAgIG1heFRleHREaW1zID0gY3VycmVudEJCb3g7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50QkJveC53aWR0aCA+IG1heFRleHREaW1zLndpZHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIG1heFRleHREaW1zLndpZHRoID0gY3VycmVudEJCb3gud2lkdGg7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBpZiAoY3VycmVudEJCb3guaGVpZ2h0ID4gbWF4VGV4dERpbXMuaGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIG1heFRleHREaW1zLmhlaWdodCA9IGN1cnJlbnRCQm94LmhlaWdodDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGV4KSB7XG4gICAgICAgICAgICAgIC8vIFNraXAgZHJhd2luZyBpZiBlbGVtZW50IGlzIG5vdCBkaXNwbGF5ZWQgLSBGaXJlZm94IHdvdWxkIHRocm93IGFuIGVycm9yIGhlcmVcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbm9kZS5kaW1lbnNpb24ud2lkdGggPVxuICAgICAgICAgICAgICBub2RlLmRpbWVuc2lvbi53aWR0aCAmJiBub2RlLm1ldGEuZm9yY2VEaW1lbnNpb25zID8gbm9kZS5kaW1lbnNpb24ud2lkdGggOiBtYXhUZXh0RGltcy53aWR0aCArIDIwO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBub2RlLmRpbWVuc2lvbi53aWR0aCA9XG4gICAgICAgICAgICAgIG5vZGUuZGltZW5zaW9uLndpZHRoICYmIG5vZGUubWV0YS5mb3JjZURpbWVuc2lvbnMgPyBub2RlLmRpbWVuc2lvbi53aWR0aCA6IGRpbXMud2lkdGg7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubm9kZU1heFdpZHRoKSB7XG4gICAgICAgICAgbm9kZS5kaW1lbnNpb24ud2lkdGggPSBNYXRoLm1heChub2RlLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5ub2RlTWF4V2lkdGgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm5vZGVNaW5XaWR0aCkge1xuICAgICAgICAgIG5vZGUuZGltZW5zaW9uLndpZHRoID0gTWF0aC5taW4obm9kZS5kaW1lbnNpb24ud2lkdGgsIHRoaXMubm9kZU1pbldpZHRoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlZHJhd3MgdGhlIGxpbmVzIHdoZW4gZHJhZ2dlZCBvciB2aWV3cG9ydCB1cGRhdGVkXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgcmVkcmF3TGluZXMoX2FuaW1hdGUgPSB0aGlzLmFuaW1hdGUpOiB2b2lkIHtcbiAgICB0aGlzLmxpbmtFbGVtZW50cy5tYXAobGlua0VsID0+IHtcbiAgICAgIGNvbnN0IGVkZ2UgPSB0aGlzLmdyYXBoLmVkZ2VzLmZpbmQobGluID0+IGxpbi5pZCA9PT0gbGlua0VsLm5hdGl2ZUVsZW1lbnQuaWQpO1xuXG4gICAgICBpZiAoZWRnZSkge1xuICAgICAgICBjb25zdCBsaW5rU2VsZWN0aW9uID0gc2VsZWN0KGxpbmtFbC5uYXRpdmVFbGVtZW50KS5zZWxlY3QoJy5saW5lJyk7XG4gICAgICAgIGxpbmtTZWxlY3Rpb25cbiAgICAgICAgICAuYXR0cignZCcsIGVkZ2Uub2xkTGluZSlcbiAgICAgICAgICAudHJhbnNpdGlvbigpXG4gICAgICAgICAgLmVhc2UoZWFzZS5lYXNlU2luSW5PdXQpXG4gICAgICAgICAgLmR1cmF0aW9uKF9hbmltYXRlID8gNTAwIDogMClcbiAgICAgICAgICAuYXR0cignZCcsIGVkZ2UubGluZSk7XG5cbiAgICAgICAgY29uc3QgdGV4dFBhdGhTZWxlY3Rpb24gPSBzZWxlY3QodGhpcy5lbC5uYXRpdmVFbGVtZW50KS5zZWxlY3QoYCMke2VkZ2UuaWR9YCk7XG4gICAgICAgIHRleHRQYXRoU2VsZWN0aW9uXG4gICAgICAgICAgLmF0dHIoJ2QnLCBlZGdlLm9sZFRleHRQYXRoKVxuICAgICAgICAgIC50cmFuc2l0aW9uKClcbiAgICAgICAgICAuZWFzZShlYXNlLmVhc2VTaW5Jbk91dClcbiAgICAgICAgICAuZHVyYXRpb24oX2FuaW1hdGUgPyA1MDAgOiAwKVxuICAgICAgICAgIC5hdHRyKCdkJywgZWRnZS50ZXh0UGF0aCk7XG5cbiAgICAgICAgdGhpcy51cGRhdGVNaWRwb2ludE9uRWRnZShlZGdlLCBlZGdlLnBvaW50cyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2FsY3VsYXRlIHRoZSB0ZXh0IGRpcmVjdGlvbnMgLyBmbGlwcGluZ1xuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIGNhbGNEb21pbmFudEJhc2VsaW5lKGxpbmspOiB2b2lkIHtcbiAgICBjb25zdCBmaXJzdFBvaW50ID0gbGluay5wb2ludHNbMF07XG4gICAgY29uc3QgbGFzdFBvaW50ID0gbGluay5wb2ludHNbbGluay5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgbGluay5vbGRUZXh0UGF0aCA9IGxpbmsudGV4dFBhdGg7XG5cbiAgICBpZiAobGFzdFBvaW50LnggPCBmaXJzdFBvaW50LngpIHtcbiAgICAgIGxpbmsuZG9taW5hbnRCYXNlbGluZSA9ICd0ZXh0LWJlZm9yZS1lZGdlJztcblxuICAgICAgLy8gcmV2ZXJzZSB0ZXh0IHBhdGggZm9yIHdoZW4gaXRzIGZsaXBwZWQgdXBzaWRlIGRvd25cbiAgICAgIGxpbmsudGV4dFBhdGggPSB0aGlzLmdlbmVyYXRlTGluZShbLi4ubGluay5wb2ludHNdLnJldmVyc2UoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpbmsuZG9taW5hbnRCYXNlbGluZSA9ICd0ZXh0LWFmdGVyLWVkZ2UnO1xuICAgICAgbGluay50ZXh0UGF0aCA9IGxpbmsubGluZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgdGhlIG5ldyBsaW5lIHBhdGhcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBnZW5lcmF0ZUxpbmUocG9pbnRzOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IGxpbmVGdW5jdGlvbiA9IHNoYXBlXG4gICAgICAubGluZTxhbnk+KClcbiAgICAgIC54KGQgPT4gZC54KVxuICAgICAgLnkoZCA9PiBkLnkpXG4gICAgICAuY3VydmUodGhpcy5jdXJ2ZSk7XG4gICAgcmV0dXJuIGxpbmVGdW5jdGlvbihwb2ludHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFpvb20gd2FzIGludm9rZWQgZnJvbSBldmVudFxuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIG9uWm9vbSgkZXZlbnQ6IFdoZWVsRXZlbnQsIGRpcmVjdGlvbik6IHZvaWQge1xuICAgIGlmICh0aGlzLmVuYWJsZVRyYWNrcGFkU3VwcG9ydCAmJiAhJGV2ZW50LmN0cmxLZXkpIHtcbiAgICAgIHRoaXMucGFuKCRldmVudC5kZWx0YVggKiAtMSwgJGV2ZW50LmRlbHRhWSAqIC0xKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB6b29tRmFjdG9yID0gMSArIChkaXJlY3Rpb24gPT09ICdpbicgPyB0aGlzLnpvb21TcGVlZCA6IC10aGlzLnpvb21TcGVlZCk7XG5cbiAgICAvLyBDaGVjayB0aGF0IHpvb21pbmcgd291bGRuJ3QgcHV0IHVzIG91dCBvZiBib3VuZHNcbiAgICBjb25zdCBuZXdab29tTGV2ZWwgPSB0aGlzLnpvb21MZXZlbCAqIHpvb21GYWN0b3I7XG4gICAgaWYgKG5ld1pvb21MZXZlbCA8PSB0aGlzLm1pblpvb21MZXZlbCB8fCBuZXdab29tTGV2ZWwgPj0gdGhpcy5tYXhab29tTGV2ZWwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB6b29taW5nIGlzIGVuYWJsZWQgb3Igbm90XG4gICAgaWYgKCF0aGlzLmVuYWJsZVpvb20pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5wYW5Pblpvb20gPT09IHRydWUgJiYgJGV2ZW50KSB7XG4gICAgICAvLyBBYnNvbHV0ZSBtb3VzZSBYL1kgb24gdGhlIHNjcmVlblxuICAgICAgY29uc3QgbW91c2VYID0gJGV2ZW50LmNsaWVudFg7XG4gICAgICBjb25zdCBtb3VzZVkgPSAkZXZlbnQuY2xpZW50WTtcblxuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBtb3VzZSBYL1kgaW50byBhIFNWRyBYL1lcbiAgICAgIGNvbnN0IHN2ZyA9IHRoaXMuZWwubmF0aXZlRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdzdmcnKTtcbiAgICAgIGNvbnN0IHN2Z0dyb3VwID0gc3ZnLnF1ZXJ5U2VsZWN0b3IoJ2cuY2hhcnQnKTtcblxuICAgICAgY29uc3QgcG9pbnQgPSBzdmcuY3JlYXRlU1ZHUG9pbnQoKTtcbiAgICAgIHBvaW50LnggPSBtb3VzZVg7XG4gICAgICBwb2ludC55ID0gbW91c2VZO1xuICAgICAgY29uc3Qgc3ZnUG9pbnQgPSBwb2ludC5tYXRyaXhUcmFuc2Zvcm0oc3ZnR3JvdXAuZ2V0U2NyZWVuQ1RNKCkuaW52ZXJzZSgpKTtcblxuICAgICAgLy8gUGFuem9vbVxuICAgICAgdGhpcy5wYW4oc3ZnUG9pbnQueCwgc3ZnUG9pbnQueSwgdHJ1ZSk7XG4gICAgICB0aGlzLnpvb20oem9vbUZhY3Rvcik7XG4gICAgICB0aGlzLnBhbigtc3ZnUG9pbnQueCwgLXN2Z1BvaW50LnksIHRydWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnpvb20oem9vbUZhY3Rvcik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFBhbiBieSB4L3lcbiAgICpcbiAgICogQHBhcmFtIHhcbiAgICogQHBhcmFtIHlcbiAgICovXG4gIHBhbih4OiBudW1iZXIsIHk6IG51bWJlciwgaWdub3JlWm9vbUxldmVsOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjb25zdCB6b29tTGV2ZWwgPSBpZ25vcmVab29tTGV2ZWwgPyAxIDogdGhpcy56b29tTGV2ZWw7XG4gICAgdGhpcy50cmFuc2Zvcm1hdGlvbk1hdHJpeCA9IHRyYW5zZm9ybSh0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4LCB0cmFuc2xhdGUoeCAvIHpvb21MZXZlbCwgeSAvIHpvb21MZXZlbCkpO1xuXG4gICAgdGhpcy51cGRhdGVUcmFuc2Zvcm0oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYW4gdG8gYSBmaXhlZCB4L3lcbiAgICpcbiAgICovXG4gIHBhblRvKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHggPT09IG51bGwgfHwgeCA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKHgpIHx8IHkgPT09IG51bGwgfHwgeSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKHkpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcGFuWCA9IC10aGlzLnBhbk9mZnNldFggLSB4ICogdGhpcy56b29tTGV2ZWwgKyB0aGlzLmRpbXMud2lkdGggLyAyO1xuICAgIGNvbnN0IHBhblkgPSAtdGhpcy5wYW5PZmZzZXRZIC0geSAqIHRoaXMuem9vbUxldmVsICsgdGhpcy5kaW1zLmhlaWdodCAvIDI7XG5cbiAgICB0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4ID0gdHJhbnNmb3JtKFxuICAgICAgdGhpcy50cmFuc2Zvcm1hdGlvbk1hdHJpeCxcbiAgICAgIHRyYW5zbGF0ZShwYW5YIC8gdGhpcy56b29tTGV2ZWwsIHBhblkgLyB0aGlzLnpvb21MZXZlbClcbiAgICApO1xuXG4gICAgdGhpcy51cGRhdGVUcmFuc2Zvcm0oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBab29tIGJ5IGEgZmFjdG9yXG4gICAqXG4gICAqL1xuICB6b29tKGZhY3RvcjogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy50cmFuc2Zvcm1hdGlvbk1hdHJpeCA9IHRyYW5zZm9ybSh0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4LCBzY2FsZShmYWN0b3IsIGZhY3RvcikpO1xuICAgIHRoaXMuem9vbUNoYW5nZS5lbWl0KHRoaXMuem9vbUxldmVsKTtcbiAgICB0aGlzLnVwZGF0ZVRyYW5zZm9ybSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFpvb20gdG8gYSBmaXhlZCBsZXZlbFxuICAgKlxuICAgKi9cbiAgem9vbVRvKGxldmVsOiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4LmEgPSBpc05hTihsZXZlbCkgPyB0aGlzLnRyYW5zZm9ybWF0aW9uTWF0cml4LmEgOiBOdW1iZXIobGV2ZWwpO1xuICAgIHRoaXMudHJhbnNmb3JtYXRpb25NYXRyaXguZCA9IGlzTmFOKGxldmVsKSA/IHRoaXMudHJhbnNmb3JtYXRpb25NYXRyaXguZCA6IE51bWJlcihsZXZlbCk7XG4gICAgdGhpcy56b29tQ2hhbmdlLmVtaXQodGhpcy56b29tTGV2ZWwpO1xuICAgIGlmICh0aGlzLmVuYWJsZVByZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgdGhpcy51cGRhdGVUcmFuc2Zvcm0oKTtcbiAgICB9XG4gICAgdGhpcy51cGRhdGUoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEcmFnIHdhcyBpbnZva2VkIGZyb20gYW4gZXZlbnRcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBvbkRyYWcoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZHJhZ2dpbmdFbmFibGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5vZGUgPSB0aGlzLmRyYWdnaW5nTm9kZTtcbiAgICBpZiAodGhpcy5sYXlvdXQgJiYgdHlwZW9mIHRoaXMubGF5b3V0ICE9PSAnc3RyaW5nJyAmJiB0aGlzLmxheW91dC5vbkRyYWcpIHtcbiAgICAgIHRoaXMubGF5b3V0Lm9uRHJhZyhub2RlLCBldmVudCk7XG4gICAgfVxuXG4gICAgbm9kZS5wb3NpdGlvbi54ICs9IGV2ZW50Lm1vdmVtZW50WCAvIHRoaXMuem9vbUxldmVsO1xuICAgIG5vZGUucG9zaXRpb24ueSArPSBldmVudC5tb3ZlbWVudFkgLyB0aGlzLnpvb21MZXZlbDtcblxuICAgIC8vIG1vdmUgdGhlIG5vZGVcbiAgICBjb25zdCB4ID0gbm9kZS5wb3NpdGlvbi54IC0gKHRoaXMuY2VudGVyTm9kZXNPblBvc2l0aW9uQ2hhbmdlID8gbm9kZS5kaW1lbnNpb24ud2lkdGggLyAyIDogMCk7XG4gICAgY29uc3QgeSA9IG5vZGUucG9zaXRpb24ueSAtICh0aGlzLmNlbnRlck5vZGVzT25Qb3NpdGlvbkNoYW5nZSA/IG5vZGUuZGltZW5zaW9uLmhlaWdodCAvIDIgOiAwKTtcbiAgICBub2RlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHt4fSwgJHt5fSlgO1xuXG4gICAgZm9yIChjb25zdCBsaW5rIG9mIHRoaXMuZ3JhcGguZWRnZXMpIHtcbiAgICAgIGlmIChcbiAgICAgICAgbGluay50YXJnZXQgPT09IG5vZGUuaWQgfHxcbiAgICAgICAgbGluay5zb3VyY2UgPT09IG5vZGUuaWQgfHxcbiAgICAgICAgKGxpbmsudGFyZ2V0IGFzIGFueSkuaWQgPT09IG5vZGUuaWQgfHxcbiAgICAgICAgKGxpbmsuc291cmNlIGFzIGFueSkuaWQgPT09IG5vZGUuaWRcbiAgICAgICkge1xuICAgICAgICBpZiAodGhpcy5sYXlvdXQgJiYgdHlwZW9mIHRoaXMubGF5b3V0ICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMubGF5b3V0LnVwZGF0ZUVkZ2UodGhpcy5ncmFwaCwgbGluayk7XG4gICAgICAgICAgY29uc3QgcmVzdWx0JCA9IHJlc3VsdCBpbnN0YW5jZW9mIE9ic2VydmFibGUgPyByZXN1bHQgOiBvZihyZXN1bHQpO1xuICAgICAgICAgIHRoaXMuZ3JhcGhTdWJzY3JpcHRpb24uYWRkKFxuICAgICAgICAgICAgcmVzdWx0JC5zdWJzY3JpYmUoZ3JhcGggPT4ge1xuICAgICAgICAgICAgICB0aGlzLmdyYXBoID0gZ3JhcGg7XG4gICAgICAgICAgICAgIHRoaXMucmVkcmF3RWRnZShsaW5rKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMucmVkcmF3TGluZXMoZmFsc2UpO1xuICAgIHRoaXMudXBkYXRlTWluaW1hcCgpO1xuICB9XG5cbiAgcmVkcmF3RWRnZShlZGdlOiBFZGdlKSB7XG4gICAgY29uc3QgbGluZSA9IHRoaXMuZ2VuZXJhdGVMaW5lKGVkZ2UucG9pbnRzKTtcbiAgICB0aGlzLmNhbGNEb21pbmFudEJhc2VsaW5lKGVkZ2UpO1xuICAgIGVkZ2Uub2xkTGluZSA9IGVkZ2UubGluZTtcbiAgICBlZGdlLmxpbmUgPSBsaW5lO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgZW50aXJlIHZpZXcgZm9yIHRoZSBuZXcgcGFuIHBvc2l0aW9uXG4gICAqXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgdXBkYXRlVHJhbnNmb3JtKCk6IHZvaWQge1xuICAgIHRoaXMudHJhbnNmb3JtID0gdG9TVkcoc21vb3RoTWF0cml4KHRoaXMudHJhbnNmb3JtYXRpb25NYXRyaXgsIDEwMCkpO1xuICAgIHRoaXMuc3RhdGVDaGFuZ2UuZW1pdCh7IHN0YXRlOiBOZ3hHcmFwaFN0YXRlcy5UcmFuc2Zvcm0gfSk7XG4gIH1cblxuICAvKipcbiAgICogTm9kZSB3YXMgY2xpY2tlZFxuICAgKlxuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIG9uQ2xpY2soZXZlbnQ6IGFueSk6IHZvaWQge1xuICAgIHRoaXMuc2VsZWN0LmVtaXQoZXZlbnQpO1xuICB9XG5cbiAgLyoqXG4gICAqIE5vZGUgd2FzIGZvY3VzZWRcbiAgICpcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBvbkFjdGl2YXRlKGV2ZW50KTogdm9pZCB7XG4gICAgaWYgKHRoaXMuYWN0aXZlRW50cmllcy5pbmRleE9mKGV2ZW50KSA+IC0xKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuYWN0aXZlRW50cmllcyA9IFtldmVudCwgLi4udGhpcy5hY3RpdmVFbnRyaWVzXTtcbiAgICB0aGlzLmFjdGl2YXRlLmVtaXQoeyB2YWx1ZTogZXZlbnQsIGVudHJpZXM6IHRoaXMuYWN0aXZlRW50cmllcyB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBOb2RlIHdhcyBkZWZvY3VzZWRcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBvbkRlYWN0aXZhdGUoZXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBpZHggPSB0aGlzLmFjdGl2ZUVudHJpZXMuaW5kZXhPZihldmVudCk7XG5cbiAgICB0aGlzLmFjdGl2ZUVudHJpZXMuc3BsaWNlKGlkeCwgMSk7XG4gICAgdGhpcy5hY3RpdmVFbnRyaWVzID0gWy4uLnRoaXMuYWN0aXZlRW50cmllc107XG5cbiAgICB0aGlzLmRlYWN0aXZhdGUuZW1pdCh7IHZhbHVlOiBldmVudCwgZW50cmllczogdGhpcy5hY3RpdmVFbnRyaWVzIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgZG9tYWluIHNlcmllcyBmb3IgdGhlIG5vZGVzXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgZ2V0U2VyaWVzRG9tYWluKCk6IGFueVtdIHtcbiAgICByZXR1cm4gdGhpcy5ub2Rlc1xuICAgICAgLm1hcChkID0+IHRoaXMuZ3JvdXBSZXN1bHRzQnkoZCkpXG4gICAgICAucmVkdWNlKChub2Rlczogc3RyaW5nW10sIG5vZGUpOiBhbnlbXSA9PiAobm9kZXMuaW5kZXhPZihub2RlKSAhPT0gLTEgPyBub2RlcyA6IG5vZGVzLmNvbmNhdChbbm9kZV0pKSwgW10pXG4gICAgICAuc29ydCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyYWNraW5nIGZvciB0aGUgbGlua1xuICAgKlxuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIHRyYWNrTGlua0J5KGluZGV4OiBudW1iZXIsIGxpbms6IEVkZ2UpOiBhbnkge1xuICAgIHJldHVybiBsaW5rLmlkO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyYWNraW5nIGZvciB0aGUgbm9kZVxuICAgKlxuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIHRyYWNrTm9kZUJ5KGluZGV4OiBudW1iZXIsIG5vZGU6IE5vZGUpOiBhbnkge1xuICAgIHJldHVybiBub2RlLmlkO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGNvbG9ycyB0aGUgbm9kZXNcbiAgICpcbiAgICpcbiAgICogQG1lbWJlck9mIEdyYXBoQ29tcG9uZW50XG4gICAqL1xuICBzZXRDb2xvcnMoKTogdm9pZCB7XG4gICAgdGhpcy5jb2xvcnMgPSBuZXcgQ29sb3JIZWxwZXIodGhpcy5zY2hlbWUsIHRoaXMuc2VyaWVzRG9tYWluLCB0aGlzLmN1c3RvbUNvbG9ycyk7XG4gIH1cblxuICAvKipcbiAgICogT24gbW91c2UgbW92ZSBldmVudCwgdXNlZCBmb3IgcGFubmluZyBhbmQgZHJhZ2dpbmcuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgQEhvc3RMaXN0ZW5lcignZG9jdW1lbnQ6bW91c2Vtb3ZlJywgWyckZXZlbnQnXSlcbiAgb25Nb3VzZU1vdmUoJGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG4gICAgdGhpcy5pc01vdXNlTW92ZUNhbGxlZCA9IHRydWU7XG4gICAgaWYgKCh0aGlzLmlzUGFubmluZyB8fCB0aGlzLmlzTWluaW1hcFBhbm5pbmcpICYmIHRoaXMucGFubmluZ0VuYWJsZWQpIHtcbiAgICAgIHRoaXMucGFuV2l0aENvbnN0cmFpbnRzKHRoaXMucGFubmluZ0F4aXMsICRldmVudCk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmlzRHJhZ2dpbmcgJiYgdGhpcy5kcmFnZ2luZ0VuYWJsZWQpIHtcbiAgICAgIHRoaXMub25EcmFnKCRldmVudCk7XG4gICAgfVxuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignZG9jdW1lbnQ6bW91c2Vkb3duJywgWyckZXZlbnQnXSlcbiAgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgICB0aGlzLmlzTW91c2VNb3ZlQ2FsbGVkID0gZmFsc2U7XG4gIH1cblxuICBASG9zdExpc3RlbmVyKCdkb2N1bWVudDpjbGljaycsIFsnJGV2ZW50J10pXG4gIGdyYXBoQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuaXNNb3VzZU1vdmVDYWxsZWQpIHRoaXMuY2xpY2tIYW5kbGVyLmVtaXQoZXZlbnQpO1xuICB9XG5cbiAgLyoqXG4gICAqIE9uIHRvdWNoIHN0YXJ0IGV2ZW50IHRvIGVuYWJsZSBwYW5uaW5nLlxuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIG9uVG91Y2hTdGFydChldmVudDogYW55KTogdm9pZCB7XG4gICAgdGhpcy5fdG91Y2hMYXN0WCA9IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFg7XG4gICAgdGhpcy5fdG91Y2hMYXN0WSA9IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFk7XG5cbiAgICB0aGlzLmlzUGFubmluZyA9IHRydWU7XG4gIH1cblxuICAvKipcbiAgICogT24gdG91Y2ggbW92ZSBldmVudCwgdXNlZCBmb3IgcGFubmluZy5cbiAgICpcbiAgICovXG4gIEBIb3N0TGlzdGVuZXIoJ2RvY3VtZW50OnRvdWNobW92ZScsIFsnJGV2ZW50J10pXG4gIG9uVG91Y2hNb3ZlKCRldmVudDogYW55KTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaXNQYW5uaW5nICYmIHRoaXMucGFubmluZ0VuYWJsZWQpIHtcbiAgICAgIGNvbnN0IGNsaWVudFggPSAkZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgIGNvbnN0IGNsaWVudFkgPSAkZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgIGNvbnN0IG1vdmVtZW50WCA9IGNsaWVudFggLSB0aGlzLl90b3VjaExhc3RYO1xuICAgICAgY29uc3QgbW92ZW1lbnRZID0gY2xpZW50WSAtIHRoaXMuX3RvdWNoTGFzdFk7XG4gICAgICB0aGlzLl90b3VjaExhc3RYID0gY2xpZW50WDtcbiAgICAgIHRoaXMuX3RvdWNoTGFzdFkgPSBjbGllbnRZO1xuXG4gICAgICB0aGlzLnBhbihtb3ZlbWVudFgsIG1vdmVtZW50WSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIE9uIHRvdWNoIGVuZCBldmVudCB0byBkaXNhYmxlIHBhbm5pbmcuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgb25Ub3VjaEVuZChldmVudDogYW55KSB7XG4gICAgdGhpcy5pc1Bhbm5pbmcgPSBmYWxzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBPbiBtb3VzZSB1cCBldmVudCB0byBkaXNhYmxlIHBhbm5pbmcvZHJhZ2dpbmcuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgQEhvc3RMaXN0ZW5lcignZG9jdW1lbnQ6bW91c2V1cCcsIFsnJGV2ZW50J10pXG4gIG9uTW91c2VVcChldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xuICAgIHRoaXMuaXNEcmFnZ2luZyA9IGZhbHNlO1xuICAgIHRoaXMuaXNQYW5uaW5nID0gZmFsc2U7XG4gICAgdGhpcy5pc01pbmltYXBQYW5uaW5nID0gZmFsc2U7XG4gICAgaWYgKHRoaXMubGF5b3V0ICYmIHR5cGVvZiB0aGlzLmxheW91dCAhPT0gJ3N0cmluZycgJiYgdGhpcy5sYXlvdXQub25EcmFnRW5kKSB7XG4gICAgICB0aGlzLmxheW91dC5vbkRyYWdFbmQodGhpcy5kcmFnZ2luZ05vZGUsIGV2ZW50KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogT24gbm9kZSBtb3VzZSBkb3duIHRvIGtpY2sgb2ZmIGRyYWdnaW5nXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgb25Ob2RlTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50LCBub2RlOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZHJhZ2dpbmdFbmFibGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaXNEcmFnZ2luZyA9IHRydWU7XG4gICAgdGhpcy5kcmFnZ2luZ05vZGUgPSBub2RlO1xuXG4gICAgaWYgKHRoaXMubGF5b3V0ICYmIHR5cGVvZiB0aGlzLmxheW91dCAhPT0gJ3N0cmluZycgJiYgdGhpcy5sYXlvdXQub25EcmFnU3RhcnQpIHtcbiAgICAgIHRoaXMubGF5b3V0Lm9uRHJhZ1N0YXJ0KG5vZGUsIGV2ZW50KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogT24gbWluaW1hcCBkcmFnIG1vdXNlIGRvd24gdG8ga2ljayBvZmYgbWluaW1hcCBwYW5uaW5nXG4gICAqXG4gICAqIEBtZW1iZXJPZiBHcmFwaENvbXBvbmVudFxuICAgKi9cbiAgb25NaW5pbWFwRHJhZ01vdXNlRG93bigpOiB2b2lkIHtcbiAgICB0aGlzLmlzTWluaW1hcFBhbm5pbmcgPSB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIE9uIG1pbmltYXAgcGFuIGV2ZW50LiBQYW5zIHRoZSBncmFwaCB0byB0aGUgY2xpY2tlZCBwb3NpdGlvblxuICAgKlxuICAgKiBAbWVtYmVyT2YgR3JhcGhDb21wb25lbnRcbiAgICovXG4gIG9uTWluaW1hcFBhblRvKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgeCA9XG4gICAgICBldmVudC5vZmZzZXRYIC0gKHRoaXMuZGltcy53aWR0aCAtICh0aGlzLmdyYXBoRGltcy53aWR0aCArIHRoaXMubWluaW1hcE9mZnNldFgpIC8gdGhpcy5taW5pbWFwU2NhbGVDb2VmZmljaWVudCk7XG4gICAgY29uc3QgeSA9IGV2ZW50Lm9mZnNldFkgKyB0aGlzLm1pbmltYXBPZmZzZXRZIC8gdGhpcy5taW5pbWFwU2NhbGVDb2VmZmljaWVudDtcblxuICAgIHRoaXMucGFuVG8oeCAqIHRoaXMubWluaW1hcFNjYWxlQ29lZmZpY2llbnQsIHkgKiB0aGlzLm1pbmltYXBTY2FsZUNvZWZmaWNpZW50KTtcbiAgICB0aGlzLmlzTWluaW1hcFBhbm5pbmcgPSB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIENlbnRlciB0aGUgZ3JhcGggaW4gdGhlIHZpZXdwb3J0XG4gICAqL1xuICBjZW50ZXIoKTogdm9pZCB7XG4gICAgdGhpcy5wYW5Ubyh0aGlzLmdyYXBoRGltcy53aWR0aCAvIDIsIHRoaXMuZ3JhcGhEaW1zLmhlaWdodCAvIDIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFpvb21zIHRvIGZpdCB0aGUgZW50aXJlIGdyYXBoXG4gICAqL1xuICB6b29tVG9GaXQoem9vbU9wdGlvbnM/OiBOZ3hHcmFwaFpvb21PcHRpb25zKTogdm9pZCB7XG4gICAgdGhpcy51cGRhdGVHcmFwaERpbXMoKTtcbiAgICBjb25zdCBoZWlnaHRab29tID0gdGhpcy5kaW1zLmhlaWdodCAvIHRoaXMuZ3JhcGhEaW1zLmhlaWdodDtcbiAgICBjb25zdCB3aWR0aFpvb20gPSB0aGlzLmRpbXMud2lkdGggLyB0aGlzLmdyYXBoRGltcy53aWR0aDtcbiAgICBsZXQgem9vbUxldmVsID0gTWF0aC5taW4oaGVpZ2h0Wm9vbSwgd2lkdGhab29tLCAxKTtcblxuICAgIGlmICh6b29tTGV2ZWwgPCB0aGlzLm1pblpvb21MZXZlbCkge1xuICAgICAgem9vbUxldmVsID0gdGhpcy5taW5ab29tTGV2ZWw7XG4gICAgfVxuXG4gICAgaWYgKHpvb21MZXZlbCA+IHRoaXMubWF4Wm9vbUxldmVsKSB7XG4gICAgICB6b29tTGV2ZWwgPSB0aGlzLm1heFpvb21MZXZlbDtcbiAgICB9XG5cbiAgICBpZiAoem9vbU9wdGlvbnM/LmZvcmNlID09PSB0cnVlIHx8IHpvb21MZXZlbCAhPT0gdGhpcy56b29tTGV2ZWwpIHtcbiAgICAgIHRoaXMuem9vbUxldmVsID0gem9vbUxldmVsO1xuXG4gICAgICBpZiAoem9vbU9wdGlvbnM/LmF1dG9DZW50ZXIgIT09IHRydWUpIHtcbiAgICAgICAgdGhpcy51cGRhdGVUcmFuc2Zvcm0oKTtcbiAgICAgIH1cbiAgICAgIGlmICh6b29tT3B0aW9ucz8uYXV0b0NlbnRlciA9PT0gdHJ1ZSkge1xuICAgICAgICB0aGlzLmNlbnRlcigpO1xuICAgICAgfVxuICAgICAgdGhpcy56b29tQ2hhbmdlLmVtaXQodGhpcy56b29tTGV2ZWwpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQYW5zIHRvIHRoZSBub2RlXG4gICAqIEBwYXJhbSBub2RlSWRcbiAgICovXG4gIHBhblRvTm9kZUlkKG5vZGVJZDogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IHRoaXMuZ3JhcGgubm9kZXMuZmluZChuID0+IG4uaWQgPT09IG5vZGVJZCk7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wYW5Ubyhub2RlLnBvc2l0aW9uLngsIG5vZGUucG9zaXRpb24ueSk7XG4gIH1cblxuICBnZXRDb21wb3VuZE5vZGVDaGlsZHJlbihpZHM6IEFycmF5PHN0cmluZz4pIHtcbiAgICByZXR1cm4gdGhpcy5ub2Rlcy5maWx0ZXIobm9kZSA9PiBpZHMuaW5jbHVkZXMobm9kZS5pZCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYW5XaXRoQ29uc3RyYWludHMoa2V5OiBzdHJpbmcsIGV2ZW50OiBNb3VzZUV2ZW50KSB7XG4gICAgbGV0IHggPSBldmVudC5tb3ZlbWVudFg7XG4gICAgbGV0IHkgPSBldmVudC5tb3ZlbWVudFk7XG4gICAgaWYgKHRoaXMuaXNNaW5pbWFwUGFubmluZykge1xuICAgICAgeCA9IC10aGlzLm1pbmltYXBTY2FsZUNvZWZmaWNpZW50ICogeCAqIHRoaXMuem9vbUxldmVsO1xuICAgICAgeSA9IC10aGlzLm1pbmltYXBTY2FsZUNvZWZmaWNpZW50ICogeSAqIHRoaXMuem9vbUxldmVsO1xuICAgIH1cblxuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICBjYXNlIFBhbm5pbmdBeGlzLkhvcml6b250YWw6XG4gICAgICAgIHRoaXMucGFuKHgsIDApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGFubmluZ0F4aXMuVmVydGljYWw6XG4gICAgICAgIHRoaXMucGFuKDAsIHkpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRoaXMucGFuKHgsIHkpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZU1pZHBvaW50T25FZGdlKGVkZ2U6IEVkZ2UsIHBvaW50czogYW55KTogdm9pZCB7XG4gICAgaWYgKCFlZGdlIHx8ICFwb2ludHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAocG9pbnRzLmxlbmd0aCAlIDIgPT09IDEpIHtcbiAgICAgIGVkZ2UubWlkUG9pbnQgPSBwb2ludHNbTWF0aC5mbG9vcihwb2ludHMubGVuZ3RoIC8gMildO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDaGVja2luZyBpZiB0aGUgY3VycmVudCBsYXlvdXQgaXMgRWxrXG4gICAgICBpZiAoKHRoaXMubGF5b3V0IGFzIExheW91dCk/LnNldHRpbmdzPy5wcm9wZXJ0aWVzPy5bJ2Vsay5kaXJlY3Rpb24nXSkge1xuICAgICAgICB0aGlzLl9jYWxjTWlkUG9pbnRFbGsoZWRnZSwgcG9pbnRzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IF9maXJzdCA9IHBvaW50c1twb2ludHMubGVuZ3RoIC8gMl07XG4gICAgICAgIGNvbnN0IF9zZWNvbmQgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAvIDIgLSAxXTtcbiAgICAgICAgZWRnZS5taWRQb2ludCA9IHtcbiAgICAgICAgICB4OiAoX2ZpcnN0LnggKyBfc2Vjb25kLngpIC8gMixcbiAgICAgICAgICB5OiAoX2ZpcnN0LnkgKyBfc2Vjb25kLnkpIC8gMlxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2NhbGNNaWRQb2ludEVsayhlZGdlOiBFZGdlLCBwb2ludHM6IGFueSk6IHZvaWQge1xuICAgIGxldCBfZmlyc3RYID0gbnVsbDtcbiAgICBsZXQgX3NlY29uZFggPSBudWxsO1xuICAgIGxldCBfZmlyc3RZID0gbnVsbDtcbiAgICBsZXQgX3NlY29uZFkgPSBudWxsO1xuICAgIGNvbnN0IG9yaWVudGF0aW9uID0gKHRoaXMubGF5b3V0IGFzIExheW91dCkuc2V0dGluZ3M/LnByb3BlcnRpZXNbJ2Vsay5kaXJlY3Rpb24nXTtcbiAgICBjb25zdCBoYXNCZW5kID1cbiAgICAgIG9yaWVudGF0aW9uID09PSAnUklHSFQnID8gcG9pbnRzLnNvbWUocCA9PiBwLnkgIT09IHBvaW50c1swXS55KSA6IHBvaW50cy5zb21lKHAgPT4gcC54ICE9PSBwb2ludHNbMF0ueCk7XG5cbiAgICBpZiAoaGFzQmVuZCkge1xuICAgICAgLy8gZ2V0dGluZyB0aGUgbGFzdCB0d28gcG9pbnRzXG4gICAgICBfZmlyc3RYID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgICAgIF9zZWNvbmRYID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAyXTtcbiAgICAgIF9maXJzdFkgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgX3NlY29uZFkgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDJdO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAob3JpZW50YXRpb24gPT09ICdSSUdIVCcpIHtcbiAgICAgICAgX2ZpcnN0WCA9IHBvaW50c1swXTtcbiAgICAgICAgX3NlY29uZFggPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICBfZmlyc3RZID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLyAyXTtcbiAgICAgICAgX3NlY29uZFkgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAvIDIgLSAxXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF9maXJzdFggPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAvIDJdO1xuICAgICAgICBfc2Vjb25kWCA9IHBvaW50c1twb2ludHMubGVuZ3RoIC8gMiAtIDFdO1xuICAgICAgICBfZmlyc3RZID0gcG9pbnRzWzBdO1xuICAgICAgICBfc2Vjb25kWSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgZWRnZS5taWRQb2ludCA9IHtcbiAgICAgIHg6IChfZmlyc3RYLnggKyBfc2Vjb25kWC54KSAvIDIsXG4gICAgICB5OiAoX2ZpcnN0WS55ICsgX3NlY29uZFkueSkgLyAyXG4gICAgfTtcbiAgfVxuXG4gIHB1YmxpYyBiYXNpY1VwZGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy52aWV3KSB7XG4gICAgICB0aGlzLndpZHRoID0gdGhpcy52aWV3WzBdO1xuICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLnZpZXdbMV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGRpbXMgPSB0aGlzLmdldENvbnRhaW5lckRpbXMoKTtcbiAgICAgIGlmIChkaW1zKSB7XG4gICAgICAgIHRoaXMud2lkdGggPSBkaW1zLndpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGRpbXMuaGVpZ2h0O1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGRlZmF1bHQgdmFsdWVzIGlmIHdpZHRoIG9yIGhlaWdodCBhcmUgMCBvciB1bmRlZmluZWRcbiAgICBpZiAoIXRoaXMud2lkdGgpIHtcbiAgICAgIHRoaXMud2lkdGggPSA2MDA7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmhlaWdodCkge1xuICAgICAgdGhpcy5oZWlnaHQgPSA0MDA7XG4gICAgfVxuXG4gICAgdGhpcy53aWR0aCA9IE1hdGguZmxvb3IodGhpcy53aWR0aCk7XG4gICAgdGhpcy5oZWlnaHQgPSBNYXRoLmZsb29yKHRoaXMuaGVpZ2h0KTtcblxuICAgIGlmICh0aGlzLmNkKSB7XG4gICAgICB0aGlzLmNkLm1hcmtGb3JDaGVjaygpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBnZXRDb250YWluZXJEaW1zKCk6IGFueSB7XG4gICAgbGV0IHdpZHRoO1xuICAgIGxldCBoZWlnaHQ7XG4gICAgY29uc3QgaG9zdEVsZW0gPSB0aGlzLmVsLm5hdGl2ZUVsZW1lbnQ7XG5cbiAgICBpZiAoaG9zdEVsZW0ucGFyZW50Tm9kZSAhPT0gbnVsbCkge1xuICAgICAgLy8gR2V0IHRoZSBjb250YWluZXIgZGltZW5zaW9uc1xuICAgICAgY29uc3QgZGltcyA9IGhvc3RFbGVtLnBhcmVudE5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICB3aWR0aCA9IGRpbXMud2lkdGg7XG4gICAgICBoZWlnaHQgPSBkaW1zLmhlaWdodDtcbiAgICB9XG5cbiAgICBpZiAod2lkdGggJiYgaGVpZ2h0KSB7XG4gICAgICByZXR1cm4geyB3aWR0aCwgaGVpZ2h0IH07XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIGlmIHRoZSBncmFwaCBoYXMgZGltZW5zaW9uc1xuICAgKi9cbiAgcHVibGljIGhhc0dyYXBoRGltcygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5ncmFwaERpbXMud2lkdGggPiAwICYmIHRoaXMuZ3JhcGhEaW1zLmhlaWdodCA+IDA7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIGlmIGFsbCBub2RlcyBoYXZlIGRpbWVuc2lvblxuICAgKi9cbiAgcHVibGljIGhhc05vZGVEaW1zKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmdyYXBoLm5vZGVzPy5ldmVyeShub2RlID0+IG5vZGUuZGltZW5zaW9uLndpZHRoID4gMCAmJiBub2RlLmRpbWVuc2lvbi5oZWlnaHQgPiAwKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgaWYgYWxsIGNvbXBvdW5kIG5vZGVzIGhhdmUgZGltZW5zaW9uXG4gICAqL1xuICBwdWJsaWMgaGFzQ29tcG91bmROb2RlRGltcygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5ncmFwaC5jb21wb3VuZE5vZGVzPy5ldmVyeShub2RlID0+IG5vZGUuZGltZW5zaW9uLndpZHRoID4gMCAmJiBub2RlLmRpbWVuc2lvbi5oZWlnaHQgPiAwKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgaWYgdGhlIGdyYXBoIGFuZCBhbGwgbm9kZXMgaGF2ZSBkaW1lbnNpb24uXG4gICAqL1xuICBwdWJsaWMgaGFzRGltcygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5oYXNHcmFwaERpbXMoKSAmJiB0aGlzLmhhc05vZGVEaW1zKCkgJiYgdGhpcy5oYXNDb21wb3VuZE5vZGVEaW1zKCk7XG4gIH1cblxuICBwcm90ZWN0ZWQgdW5iaW5kRXZlbnRzKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJlc2l6ZVN1YnNjcmlwdGlvbikge1xuICAgICAgdGhpcy5yZXNpemVTdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJpbmRXaW5kb3dSZXNpemVFdmVudCgpOiB2b2lkIHtcbiAgICBjb25zdCBzb3VyY2UgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpO1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHNvdXJjZS5waXBlKGRlYm91bmNlVGltZSgyMDApKS5zdWJzY3JpYmUoZSA9PiB7XG4gICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgaWYgKHRoaXMuY2QpIHtcbiAgICAgICAgdGhpcy5jZC5tYXJrRm9yQ2hlY2soKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlc2l6ZVN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbjtcbiAgfVxufVxuIiwiPGRpdlxuICBjbGFzcz1cIm5neC1ncmFwaC1vdXRlclwiXG4gIFtzdHlsZS53aWR0aC5weF09XCJ3aWR0aFwiXG4gIFtAYW5pbWF0aW9uU3RhdGVdPVwiJ2FjdGl2ZSdcIlxuICBbQC5kaXNhYmxlZF09XCIhYW5pbWF0aW9uc1wiXG4gIChtb3VzZVdoZWVsVXApPVwib25ab29tKCRldmVudCwgJ2luJylcIlxuICAobW91c2VXaGVlbERvd24pPVwib25ab29tKCRldmVudCwgJ291dCcpXCJcbiAgbW91c2VXaGVlbFxuPlxuICA8c3ZnOnN2ZyBjbGFzcz1cIm5neC1ncmFwaFwiIFthdHRyLndpZHRoXT1cIndpZHRoXCIgW2F0dHIuaGVpZ2h0XT1cImhlaWdodFwiPlxuICAgIDxzdmc6Z1xuICAgICAgKm5nSWY9XCJpbml0aWFsaXplZCAmJiBncmFwaFwiXG4gICAgICBbYXR0ci50cmFuc2Zvcm1dPVwidHJhbnNmb3JtXCJcbiAgICAgICh0b3VjaHN0YXJ0KT1cIm9uVG91Y2hTdGFydCgkZXZlbnQpXCJcbiAgICAgICh0b3VjaGVuZCk9XCJvblRvdWNoRW5kKCRldmVudClcIlxuICAgICAgY2xhc3M9XCJncmFwaCBjaGFydFwiXG4gICAgPlxuICAgICAgPGRlZnM+XG4gICAgICAgIDxuZy1jb250YWluZXIgKm5nSWY9XCJkZWZzVGVtcGxhdGVcIiBbbmdUZW1wbGF0ZU91dGxldF09XCJkZWZzVGVtcGxhdGVcIj48L25nLWNvbnRhaW5lcj5cbiAgICAgICAgPHN2ZzpwYXRoXG4gICAgICAgICAgY2xhc3M9XCJ0ZXh0LXBhdGhcIlxuICAgICAgICAgICpuZ0Zvcj1cImxldCBsaW5rIG9mIGdyYXBoLmVkZ2VzXCJcbiAgICAgICAgICBbYXR0ci5kXT1cImxpbmsudGV4dFBhdGhcIlxuICAgICAgICAgIFthdHRyLmlkXT1cImxpbmsuaWRcIlxuICAgICAgICA+PC9zdmc6cGF0aD5cbiAgICAgIDwvZGVmcz5cblxuICAgICAgPHN2ZzpyZWN0XG4gICAgICAgIGNsYXNzPVwicGFubmluZy1yZWN0XCJcbiAgICAgICAgW2F0dHIud2lkdGhdPVwiZGltcy53aWR0aCAqIDEwMFwiXG4gICAgICAgIFthdHRyLmhlaWdodF09XCJkaW1zLmhlaWdodCAqIDEwMFwiXG4gICAgICAgIFthdHRyLnRyYW5zZm9ybV09XCIndHJhbnNsYXRlKCcgKyAoLWRpbXMud2lkdGggfHwgMCkgKiA1MCArICcsJyArICgtZGltcy5oZWlnaHQgfHwgMCkgKiA1MCArICcpJ1wiXG4gICAgICAgIChtb3VzZWRvd24pPVwiaXNQYW5uaW5nID0gdHJ1ZVwiXG4gICAgICAvPlxuXG4gICAgICA8bmctY29udGVudD48L25nLWNvbnRlbnQ+XG5cbiAgICAgIDxzdmc6ZyBjbGFzcz1cImNsdXN0ZXJzXCI+XG4gICAgICAgIDxzdmc6Z1xuICAgICAgICAgICNjbHVzdGVyRWxlbWVudFxuICAgICAgICAgICpuZ0Zvcj1cImxldCBub2RlIG9mIGdyYXBoLmNsdXN0ZXJzOyB0cmFja0J5OiB0cmFja05vZGVCeVwiXG4gICAgICAgICAgY2xhc3M9XCJub2RlLWdyb3VwXCJcbiAgICAgICAgICBbY2xhc3Mub2xkLW5vZGVdPVwiYW5pbWF0ZSAmJiBvbGRDbHVzdGVycy5oYXMobm9kZS5pZClcIlxuICAgICAgICAgIFtpZF09XCJub2RlLmlkXCJcbiAgICAgICAgICBbYXR0ci50cmFuc2Zvcm1dPVwibm9kZS50cmFuc2Zvcm1cIlxuICAgICAgICAgIChjbGljayk9XCJvbkNsaWNrKG5vZGUpXCJcbiAgICAgICAgPlxuICAgICAgICAgIDxuZy1jb250YWluZXJcbiAgICAgICAgICAgICpuZ0lmPVwiY2x1c3RlclRlbXBsYXRlICYmICFub2RlLmhpZGRlblwiXG4gICAgICAgICAgICBbbmdUZW1wbGF0ZU91dGxldF09XCJjbHVzdGVyVGVtcGxhdGVcIlxuICAgICAgICAgICAgW25nVGVtcGxhdGVPdXRsZXRDb250ZXh0XT1cInsgJGltcGxpY2l0OiBub2RlIH1cIlxuICAgICAgICAgID48L25nLWNvbnRhaW5lcj5cbiAgICAgICAgICA8c3ZnOmcgKm5nSWY9XCIhY2x1c3RlclRlbXBsYXRlXCIgY2xhc3M9XCJub2RlIGNsdXN0ZXJcIj5cbiAgICAgICAgICAgIDxzdmc6cmVjdFxuICAgICAgICAgICAgICBbYXR0ci53aWR0aF09XCJub2RlLmRpbWVuc2lvbi53aWR0aFwiXG4gICAgICAgICAgICAgIFthdHRyLmhlaWdodF09XCJub2RlLmRpbWVuc2lvbi5oZWlnaHRcIlxuICAgICAgICAgICAgICBbYXR0ci5maWxsXT1cIm5vZGUuZGF0YT8uY29sb3JcIlxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxzdmc6dGV4dCBhbGlnbm1lbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgW2F0dHIueF09XCIxMFwiIFthdHRyLnldPVwibm9kZS5kaW1lbnNpb24uaGVpZ2h0IC8gMlwiPlxuICAgICAgICAgICAgICB7eyBub2RlLmxhYmVsIH19XG4gICAgICAgICAgICA8L3N2Zzp0ZXh0PlxuICAgICAgICAgIDwvc3ZnOmc+XG4gICAgICAgIDwvc3ZnOmc+XG4gICAgICA8L3N2ZzpnPlxuXG4gICAgICA8c3ZnOmcgY2xhc3M9XCJjb21wb3VuZC1ub2Rlc1wiPlxuICAgICAgICA8c3ZnOmdcbiAgICAgICAgICAjbm9kZUVsZW1lbnRcbiAgICAgICAgICAqbmdGb3I9XCJsZXQgbm9kZSBvZiBncmFwaC5jb21wb3VuZE5vZGVzOyB0cmFja0J5OiB0cmFja05vZGVCeVwiXG4gICAgICAgICAgY2xhc3M9XCJub2RlLWdyb3VwXCJcbiAgICAgICAgICBbY2xhc3Mub2xkLW5vZGVdPVwiYW5pbWF0ZSAmJiBvbGRDb21wb3VuZE5vZGVzLmhhcyhub2RlLmlkKVwiXG4gICAgICAgICAgW2lkXT1cIm5vZGUuaWRcIlxuICAgICAgICAgIFthdHRyLnRyYW5zZm9ybV09XCJub2RlLnRyYW5zZm9ybVwiXG4gICAgICAgICAgKGNsaWNrKT1cIm9uQ2xpY2sobm9kZSlcIlxuICAgICAgICAgIChtb3VzZWRvd24pPVwib25Ob2RlTW91c2VEb3duKCRldmVudCwgbm9kZSlcIlxuICAgICAgICA+XG4gICAgICAgICAgPG5nLWNvbnRhaW5lclxuICAgICAgICAgICAgKm5nSWY9XCJub2RlVGVtcGxhdGUgJiYgIW5vZGUuaGlkZGVuXCJcbiAgICAgICAgICAgIFtuZ1RlbXBsYXRlT3V0bGV0XT1cIm5vZGVUZW1wbGF0ZVwiXG4gICAgICAgICAgICBbbmdUZW1wbGF0ZU91dGxldENvbnRleHRdPVwieyAkaW1wbGljaXQ6IG5vZGUgfVwiXG4gICAgICAgICAgPjwvbmctY29udGFpbmVyPlxuICAgICAgICAgIDxzdmc6ZyAqbmdJZj1cIiFub2RlVGVtcGxhdGVcIiBjbGFzcz1cIm5vZGUgY29tcG91bmQtbm9kZVwiPlxuICAgICAgICAgICAgPHN2ZzpyZWN0XG4gICAgICAgICAgICAgIFthdHRyLndpZHRoXT1cIm5vZGUuZGltZW5zaW9uLndpZHRoXCJcbiAgICAgICAgICAgICAgW2F0dHIuaGVpZ2h0XT1cIm5vZGUuZGltZW5zaW9uLmhlaWdodFwiXG4gICAgICAgICAgICAgIFthdHRyLmZpbGxdPVwibm9kZS5kYXRhPy5jb2xvclwiXG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPHN2Zzp0ZXh0IGFsaWdubWVudC1iYXNlbGluZT1cImNlbnRyYWxcIiBbYXR0ci54XT1cIjEwXCIgW2F0dHIueV09XCJub2RlLmRpbWVuc2lvbi5oZWlnaHQgLyAyXCI+XG4gICAgICAgICAgICAgIHt7IG5vZGUubGFiZWwgfX1cbiAgICAgICAgICAgIDwvc3ZnOnRleHQ+XG4gICAgICAgICAgPC9zdmc6Zz5cbiAgICAgICAgPC9zdmc6Zz5cbiAgICAgIDwvc3ZnOmc+XG5cbiAgICAgIDxzdmc6ZyBjbGFzcz1cImxpbmtzXCI+XG4gICAgICAgIDxzdmc6ZyAjbGlua0VsZW1lbnQgKm5nRm9yPVwibGV0IGxpbmsgb2YgZ3JhcGguZWRnZXM7IHRyYWNrQnk6IHRyYWNrTGlua0J5XCIgY2xhc3M9XCJsaW5rLWdyb3VwXCIgW2lkXT1cImxpbmsuaWRcIj5cbiAgICAgICAgICA8bmctY29udGFpbmVyXG4gICAgICAgICAgICAqbmdJZj1cImxpbmtUZW1wbGF0ZVwiXG4gICAgICAgICAgICBbbmdUZW1wbGF0ZU91dGxldF09XCJsaW5rVGVtcGxhdGVcIlxuICAgICAgICAgICAgW25nVGVtcGxhdGVPdXRsZXRDb250ZXh0XT1cInsgJGltcGxpY2l0OiBsaW5rIH1cIlxuICAgICAgICAgID48L25nLWNvbnRhaW5lcj5cbiAgICAgICAgICA8c3ZnOnBhdGggKm5nSWY9XCIhbGlua1RlbXBsYXRlXCIgY2xhc3M9XCJlZGdlXCIgW2F0dHIuZF09XCJsaW5rLmxpbmVcIiAvPlxuICAgICAgICA8L3N2ZzpnPlxuICAgICAgPC9zdmc6Zz5cblxuICAgICAgPHN2ZzpnIGNsYXNzPVwibm9kZXNcIj5cbiAgICAgICAgPHN2ZzpnXG4gICAgICAgICAgI25vZGVFbGVtZW50XG4gICAgICAgICAgKm5nRm9yPVwibGV0IG5vZGUgb2YgZ3JhcGgubm9kZXM7IHRyYWNrQnk6IHRyYWNrTm9kZUJ5XCJcbiAgICAgICAgICBjbGFzcz1cIm5vZGUtZ3JvdXBcIlxuICAgICAgICAgIFtjbGFzcy5vbGQtbm9kZV09XCJhbmltYXRlICYmIG9sZE5vZGVzLmhhcyhub2RlLmlkKVwiXG4gICAgICAgICAgW2lkXT1cIm5vZGUuaWRcIlxuICAgICAgICAgIFthdHRyLnRyYW5zZm9ybV09XCJub2RlLnRyYW5zZm9ybVwiXG4gICAgICAgICAgKGNsaWNrKT1cIm9uQ2xpY2sobm9kZSlcIlxuICAgICAgICAgIChtb3VzZWRvd24pPVwib25Ob2RlTW91c2VEb3duKCRldmVudCwgbm9kZSlcIlxuICAgICAgICA+XG4gICAgICAgICAgPG5nLWNvbnRhaW5lclxuICAgICAgICAgICAgKm5nSWY9XCJub2RlVGVtcGxhdGUgJiYgIW5vZGUuaGlkZGVuXCJcbiAgICAgICAgICAgIFtuZ1RlbXBsYXRlT3V0bGV0XT1cIm5vZGVUZW1wbGF0ZVwiXG4gICAgICAgICAgICBbbmdUZW1wbGF0ZU91dGxldENvbnRleHRdPVwieyAkaW1wbGljaXQ6IG5vZGUgfVwiXG4gICAgICAgICAgPjwvbmctY29udGFpbmVyPlxuICAgICAgICAgIDxzdmc6Y2lyY2xlXG4gICAgICAgICAgICAqbmdJZj1cIiFub2RlVGVtcGxhdGVcIlxuICAgICAgICAgICAgcj1cIjEwXCJcbiAgICAgICAgICAgIFthdHRyLmN4XT1cIm5vZGUuZGltZW5zaW9uLndpZHRoIC8gMlwiXG4gICAgICAgICAgICBbYXR0ci5jeV09XCJub2RlLmRpbWVuc2lvbi5oZWlnaHQgLyAyXCJcbiAgICAgICAgICAgIFthdHRyLmZpbGxdPVwibm9kZS5kYXRhPy5jb2xvclwiXG4gICAgICAgICAgLz5cbiAgICAgICAgPC9zdmc6Zz5cbiAgICAgIDwvc3ZnOmc+XG4gICAgPC9zdmc6Zz5cblxuICAgIDxzdmc6Y2xpcFBhdGggW2F0dHIuaWRdPVwibWluaW1hcENsaXBQYXRoSWRcIj5cbiAgICAgIDxzdmc6cmVjdFxuICAgICAgICBbYXR0ci53aWR0aF09XCJncmFwaERpbXMud2lkdGggLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudFwiXG4gICAgICAgIFthdHRyLmhlaWdodF09XCJncmFwaERpbXMuaGVpZ2h0IC8gbWluaW1hcFNjYWxlQ29lZmZpY2llbnRcIlxuICAgICAgPjwvc3ZnOnJlY3Q+XG4gICAgPC9zdmc6Y2xpcFBhdGg+XG5cbiAgICA8c3ZnOmdcbiAgICAgIGNsYXNzPVwibWluaW1hcFwiXG4gICAgICAqbmdJZj1cInNob3dNaW5pTWFwXCJcbiAgICAgIFthdHRyLnRyYW5zZm9ybV09XCJtaW5pbWFwVHJhbnNmb3JtXCJcbiAgICAgIFthdHRyLmNsaXAtcGF0aF09XCIndXJsKCMnICsgbWluaW1hcENsaXBQYXRoSWQgKyAnKSdcIlxuICAgID5cbiAgICAgIDxzdmc6cmVjdFxuICAgICAgICBjbGFzcz1cIm1pbmltYXAtYmFja2dyb3VuZFwiXG4gICAgICAgIFthdHRyLndpZHRoXT1cImdyYXBoRGltcy53aWR0aCAvIG1pbmltYXBTY2FsZUNvZWZmaWNpZW50XCJcbiAgICAgICAgW2F0dHIuaGVpZ2h0XT1cImdyYXBoRGltcy5oZWlnaHQgLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudFwiXG4gICAgICAgIChtb3VzZWRvd24pPVwib25NaW5pbWFwUGFuVG8oJGV2ZW50KVwiXG4gICAgICA+PC9zdmc6cmVjdD5cblxuICAgICAgPHN2ZzpnXG4gICAgICAgIFtzdHlsZS50cmFuc2Zvcm1dPVwiXG4gICAgICAgICAgJ3RyYW5zbGF0ZSgnICtcbiAgICAgICAgICAtbWluaW1hcE9mZnNldFggLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudCArXG4gICAgICAgICAgJ3B4LCcgK1xuICAgICAgICAgIC1taW5pbWFwT2Zmc2V0WSAvIG1pbmltYXBTY2FsZUNvZWZmaWNpZW50ICtcbiAgICAgICAgICAncHgpJ1xuICAgICAgICBcIlxuICAgICAgPlxuICAgICAgICA8c3ZnOmcgY2xhc3M9XCJtaW5pbWFwLW5vZGVzXCIgW3N0eWxlLnRyYW5zZm9ybV09XCInc2NhbGUoJyArIDEgLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudCArICcpJ1wiPlxuICAgICAgICAgIDxzdmc6Z1xuICAgICAgICAgICAgI25vZGVFbGVtZW50XG4gICAgICAgICAgICAqbmdGb3I9XCJsZXQgbm9kZSBvZiBncmFwaC5ub2RlczsgdHJhY2tCeTogdHJhY2tOb2RlQnlcIlxuICAgICAgICAgICAgY2xhc3M9XCJub2RlLWdyb3VwXCJcbiAgICAgICAgICAgIFtjbGFzcy5vbGQtbm9kZV09XCJhbmltYXRlICYmIG9sZE5vZGVzLmhhcyhub2RlLmlkKVwiXG4gICAgICAgICAgICBbaWRdPVwibm9kZS5pZFwiXG4gICAgICAgICAgICBbYXR0ci50cmFuc2Zvcm1dPVwibm9kZS50cmFuc2Zvcm1cIlxuICAgICAgICAgID5cbiAgICAgICAgICAgIDxuZy1jb250YWluZXJcbiAgICAgICAgICAgICAgKm5nSWY9XCJtaW5pTWFwTm9kZVRlbXBsYXRlXCJcbiAgICAgICAgICAgICAgW25nVGVtcGxhdGVPdXRsZXRdPVwibWluaU1hcE5vZGVUZW1wbGF0ZVwiXG4gICAgICAgICAgICAgIFtuZ1RlbXBsYXRlT3V0bGV0Q29udGV4dF09XCJ7ICRpbXBsaWNpdDogbm9kZSB9XCJcbiAgICAgICAgICAgID48L25nLWNvbnRhaW5lcj5cbiAgICAgICAgICAgIDxuZy1jb250YWluZXJcbiAgICAgICAgICAgICAgKm5nSWY9XCIhbWluaU1hcE5vZGVUZW1wbGF0ZSAmJiBub2RlVGVtcGxhdGVcIlxuICAgICAgICAgICAgICBbbmdUZW1wbGF0ZU91dGxldF09XCJub2RlVGVtcGxhdGVcIlxuICAgICAgICAgICAgICBbbmdUZW1wbGF0ZU91dGxldENvbnRleHRdPVwieyAkaW1wbGljaXQ6IG5vZGUgfVwiXG4gICAgICAgICAgICA+PC9uZy1jb250YWluZXI+XG4gICAgICAgICAgICA8c3ZnOmNpcmNsZVxuICAgICAgICAgICAgICAqbmdJZj1cIiFub2RlVGVtcGxhdGUgJiYgIW1pbmlNYXBOb2RlVGVtcGxhdGVcIlxuICAgICAgICAgICAgICByPVwiMTBcIlxuICAgICAgICAgICAgICBbYXR0ci5jeF09XCJub2RlLmRpbWVuc2lvbi53aWR0aCAvIDIgLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudFwiXG4gICAgICAgICAgICAgIFthdHRyLmN5XT1cIm5vZGUuZGltZW5zaW9uLmhlaWdodCAvIDIgLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudFwiXG4gICAgICAgICAgICAgIFthdHRyLmZpbGxdPVwibm9kZS5kYXRhPy5jb2xvclwiXG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvc3ZnOmc+XG4gICAgICAgIDwvc3ZnOmc+XG5cbiAgICAgICAgPHN2ZzpyZWN0XG4gICAgICAgICAgW2F0dHIudHJhbnNmb3JtXT1cIlxuICAgICAgICAgICAgJ3RyYW5zbGF0ZSgnICtcbiAgICAgICAgICAgIHBhbk9mZnNldFggLyB6b29tTGV2ZWwgLyAtbWluaW1hcFNjYWxlQ29lZmZpY2llbnQgK1xuICAgICAgICAgICAgJywnICtcbiAgICAgICAgICAgIHBhbk9mZnNldFkgLyB6b29tTGV2ZWwgLyAtbWluaW1hcFNjYWxlQ29lZmZpY2llbnQgK1xuICAgICAgICAgICAgJyknXG4gICAgICAgICAgXCJcbiAgICAgICAgICBjbGFzcz1cIm1pbmltYXAtZHJhZ1wiXG4gICAgICAgICAgW2NsYXNzLnBhbm5pbmddPVwiaXNNaW5pbWFwUGFubmluZ1wiXG4gICAgICAgICAgW2F0dHIud2lkdGhdPVwid2lkdGggLyBtaW5pbWFwU2NhbGVDb2VmZmljaWVudCAvIHpvb21MZXZlbFwiXG4gICAgICAgICAgW2F0dHIuaGVpZ2h0XT1cImhlaWdodCAvIG1pbmltYXBTY2FsZUNvZWZmaWNpZW50IC8gem9vbUxldmVsXCJcbiAgICAgICAgICAobW91c2Vkb3duKT1cIm9uTWluaW1hcERyYWdNb3VzZURvd24oKVwiXG4gICAgICAgID48L3N2ZzpyZWN0PlxuICAgICAgPC9zdmc6Zz5cbiAgICA8L3N2ZzpnPlxuICA8L3N2Zzpzdmc+XG48L2Rpdj5cbiJdfQ==
