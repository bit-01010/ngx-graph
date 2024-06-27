import { id } from '../../utils/id';
import { forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { Subject } from 'rxjs';
export function toD3Node(maybeNode) {
  if (typeof maybeNode === 'string') {
    return {
      id: maybeNode,
      x: 0,
      y: 0
    };
  }
  return maybeNode;
}
export class D3ForceDirectedLayout {
  constructor() {
    this.defaultSettings = {
      force: forceSimulation().force('charge', forceManyBody().strength(-150)).force('collide', forceCollide(5)),
      forceLink: forceLink()
        .id(node => node.id)
        .distance(() => 100)
    };
    this.settings = {};
    this.outputGraph$ = new Subject();
  }
  run(graph) {
    this.inputGraph = graph;
    this.d3Graph = {
      nodes: [...this.inputGraph.nodes.map(n => ({ ...n }))],
      edges: [...this.inputGraph.edges.map(e => ({ ...e }))]
    };
    this.outputGraph = {
      nodes: [],
      edges: [],
      edgeLabels: []
    };
    this.outputGraph$.next(this.outputGraph);
    this.settings = Object.assign({}, this.defaultSettings, this.settings);
    if (this.settings.force) {
      this.settings.force
        .nodes(this.d3Graph.nodes)
        .force('link', this.settings.forceLink.links(this.d3Graph.edges))
        .alpha(0.5)
        .restart()
        .on('tick', () => {
          this.outputGraph$.next(this.d3GraphToOutputGraph(this.d3Graph));
        });
    }
    return this.outputGraph$.asObservable();
  }
  updateEdge(graph, edge) {
    const settings = Object.assign({}, this.defaultSettings, this.settings);
    if (settings.force) {
      settings.force
        .nodes(this.d3Graph.nodes)
        .force('link', settings.forceLink.links(this.d3Graph.edges))
        .alpha(0.5)
        .restart()
        .on('tick', () => {
          this.outputGraph$.next(this.d3GraphToOutputGraph(this.d3Graph));
        });
    }
    return this.outputGraph$.asObservable();
  }
  d3GraphToOutputGraph(d3Graph) {
    this.outputGraph.nodes = this.d3Graph.nodes.map(node => ({
      ...node,
      id: node.id || id(),
      position: {
        x: node.x,
        y: node.y
      },
      dimension: {
        width: (node.dimension && node.dimension.width) || 20,
        height: (node.dimension && node.dimension.height) || 20
      },
      transform: `translate(${node.x - ((node.dimension && node.dimension.width) || 20) / 2 || 0}, ${
        node.y - ((node.dimension && node.dimension.height) || 20) / 2 || 0
      })`
    }));
    this.outputGraph.edges = this.d3Graph.edges.map(edge => ({
      ...edge,
      source: toD3Node(edge.source).id,
      target: toD3Node(edge.target).id,
      points: [
        {
          x: toD3Node(edge.source).x,
          y: toD3Node(edge.source).y
        },
        {
          x: toD3Node(edge.target).x,
          y: toD3Node(edge.target).y
        }
      ]
    }));
    this.outputGraph.edgeLabels = this.outputGraph.edges;
    return this.outputGraph;
  }
  onDragStart(draggingNode, $event) {
    this.settings.force.alphaTarget(0.3).restart();
    const node = this.d3Graph.nodes.find(d3Node => d3Node.id === draggingNode.id);
    if (!node) {
      return;
    }
    this.draggingStart = { x: $event.x - node.x, y: $event.y - node.y };
    node.fx = $event.x - this.draggingStart.x;
    node.fy = $event.y - this.draggingStart.y;
  }
  onDrag(draggingNode, $event) {
    if (!draggingNode) {
      return;
    }
    const node = this.d3Graph.nodes.find(d3Node => d3Node.id === draggingNode.id);
    if (!node) {
      return;
    }
    node.fx = $event.x - this.draggingStart.x;
    node.fy = $event.y - this.draggingStart.y;
  }
  onDragEnd(draggingNode, $event) {
    if (!draggingNode) {
      return;
    }
    const node = this.d3Graph.nodes.find(d3Node => d3Node.id === draggingNode.id);
    if (!node) {
      return;
    }
    this.settings.force.alphaTarget(0);
    node.fx = undefined;
    node.fy = undefined;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZDNGb3JjZURpcmVjdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3dpbWxhbmUvbmd4LWdyYXBoL3NyYy9saWIvZ3JhcGgvbGF5b3V0cy9kM0ZvcmNlRGlyZWN0ZWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3BDLE9BQU8sRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFbkYsT0FBTyxFQUFjLE9BQU8sRUFBRSxNQUFNLE1BQU0sQ0FBQztBQTZCM0MsTUFBTSxVQUFVLFFBQVEsQ0FBQyxTQUEwQjtJQUNqRCxJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsRUFBRTtRQUNqQyxPQUFPO1lBQ0wsRUFBRSxFQUFFLFNBQVM7WUFDYixDQUFDLEVBQUUsQ0FBQztZQUNKLENBQUMsRUFBRSxDQUFDO1NBQ0wsQ0FBQztLQUNIO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELE1BQU0sT0FBTyxxQkFBcUI7SUFBbEM7UUFDRSxvQkFBZSxHQUE0QjtZQUN6QyxLQUFLLEVBQUUsZUFBZSxFQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxhQUFhLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9HLFNBQVMsRUFBRSxTQUFTLEVBQVk7aUJBQzdCLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7aUJBQ25CLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDdkIsQ0FBQztRQUNGLGFBQVEsR0FBNEIsRUFBRSxDQUFDO1FBS3ZDLGlCQUFZLEdBQW1CLElBQUksT0FBTyxFQUFFLENBQUM7SUF3SC9DLENBQUM7SUFwSEMsR0FBRyxDQUFDLEtBQVk7UUFDZCxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN4QixJQUFJLENBQUMsT0FBTyxHQUFHO1lBQ2IsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQVE7WUFDN0QsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQVE7U0FDOUQsQ0FBQztRQUNGLElBQUksQ0FBQyxXQUFXLEdBQUc7WUFDakIsS0FBSyxFQUFFLEVBQUU7WUFDVCxLQUFLLEVBQUUsRUFBRTtZQUNULFVBQVUsRUFBRSxFQUFFO1NBQ2YsQ0FBQztRQUNGLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUU7WUFDdkIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLO2lCQUNoQixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7aUJBQ3pCLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQ2hFLEtBQUssQ0FBQyxHQUFHLENBQUM7aUJBQ1YsT0FBTyxFQUFFO2lCQUNULEVBQUUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO2dCQUNmLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNsRSxDQUFDLENBQUMsQ0FBQztTQUNOO1FBRUQsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQzFDLENBQUM7SUFFRCxVQUFVLENBQUMsS0FBWSxFQUFFLElBQVU7UUFDakMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEUsSUFBSSxRQUFRLENBQUMsS0FBSyxFQUFFO1lBQ2xCLFFBQVEsQ0FBQyxLQUFLO2lCQUNYLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztpQkFDekIsS0FBSyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUMzRCxLQUFLLENBQUMsR0FBRyxDQUFDO2lCQUNWLE9BQU8sRUFBRTtpQkFDVCxFQUFFLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtnQkFDZixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEUsQ0FBQyxDQUFDLENBQUM7U0FDTjtRQUVELE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsb0JBQW9CLENBQUMsT0FBZ0I7UUFDbkMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBZ0IsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNyRSxHQUFHLElBQUk7WUFDUCxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDbkIsUUFBUSxFQUFFO2dCQUNSLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDVCxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDVjtZQUNELFNBQVMsRUFBRTtnQkFDVCxLQUFLLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTtnQkFDckQsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUU7YUFDeEQ7WUFDRCxTQUFTLEVBQUUsYUFBYSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FDeEYsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUNwRSxHQUFHO1NBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZELEdBQUcsSUFBSTtZQUNQLE1BQU0sRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUU7WUFDaEMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRTtZQUNoQyxNQUFNLEVBQUU7Z0JBQ047b0JBQ0UsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDMUIsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztpQkFDM0I7Z0JBQ0Q7b0JBQ0UsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDMUIsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztpQkFDM0I7YUFDRjtTQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDckQsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQzFCLENBQUM7SUFFRCxXQUFXLENBQUMsWUFBa0IsRUFBRSxNQUFrQjtRQUNoRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDL0MsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUUsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNULE9BQU87U0FDUjtRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNwRSxJQUFJLENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxNQUFNLENBQUMsWUFBa0IsRUFBRSxNQUFrQjtRQUMzQyxJQUFJLENBQUMsWUFBWSxFQUFFO1lBQ2pCLE9BQU87U0FDUjtRQUNELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDVCxPQUFPO1NBQ1I7UUFDRCxJQUFJLENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxTQUFTLENBQUMsWUFBa0IsRUFBRSxNQUFrQjtRQUM5QyxJQUFJLENBQUMsWUFBWSxFQUFFO1lBQ2pCLE9BQU87U0FDUjtRQUNELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDVCxPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUM7UUFDcEIsSUFBSSxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUM7SUFDdEIsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTGF5b3V0IH0gZnJvbSAnLi4vLi4vbW9kZWxzL2xheW91dC5tb2RlbCc7XG5pbXBvcnQgeyBHcmFwaCB9IGZyb20gJy4uLy4uL21vZGVscy9ncmFwaC5tb2RlbCc7XG5pbXBvcnQgeyBOb2RlIH0gZnJvbSAnLi4vLi4vbW9kZWxzL25vZGUubW9kZWwnO1xuaW1wb3J0IHsgaWQgfSBmcm9tICcuLi8uLi91dGlscy9pZCc7XG5pbXBvcnQgeyBmb3JjZUNvbGxpZGUsIGZvcmNlTGluaywgZm9yY2VNYW55Qm9keSwgZm9yY2VTaW11bGF0aW9uIH0gZnJvbSAnZDMtZm9yY2UnO1xuaW1wb3J0IHsgRWRnZSB9IGZyb20gJy4uLy4uL21vZGVscy9lZGdlLm1vZGVsJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YmplY3QgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IE5vZGVQb3NpdGlvbiB9IGZyb20gJy4uLy4uL21vZGVscyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRDNGb3JjZURpcmVjdGVkU2V0dGluZ3Mge1xuICBmb3JjZT86IGFueTtcbiAgZm9yY2VMaW5rPzogYW55O1xufVxuZXhwb3J0IGludGVyZmFjZSBEM05vZGUge1xuICBpZD86IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHdpZHRoPzogbnVtYmVyO1xuICBoZWlnaHQ/OiBudW1iZXI7XG4gIGZ4PzogbnVtYmVyO1xuICBmeT86IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgRDNFZGdlIHtcbiAgc291cmNlOiBzdHJpbmcgfCBEM05vZGU7XG4gIHRhcmdldDogc3RyaW5nIHwgRDNOb2RlO1xuICBtaWRQb2ludDogTm9kZVBvc2l0aW9uO1xufVxuZXhwb3J0IGludGVyZmFjZSBEM0dyYXBoIHtcbiAgbm9kZXM6IEQzTm9kZVtdO1xuICBlZGdlczogRDNFZGdlW107XG59XG5leHBvcnQgaW50ZXJmYWNlIE1lcmdlZE5vZGUgZXh0ZW5kcyBEM05vZGUsIE5vZGUge1xuICBpZDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9EM05vZGUobWF5YmVOb2RlOiBzdHJpbmcgfCBEM05vZGUpOiBEM05vZGUge1xuICBpZiAodHlwZW9mIG1heWJlTm9kZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IG1heWJlTm9kZSxcbiAgICAgIHg6IDAsXG4gICAgICB5OiAwXG4gICAgfTtcbiAgfVxuICByZXR1cm4gbWF5YmVOb2RlO1xufVxuXG5leHBvcnQgY2xhc3MgRDNGb3JjZURpcmVjdGVkTGF5b3V0IGltcGxlbWVudHMgTGF5b3V0IHtcbiAgZGVmYXVsdFNldHRpbmdzOiBEM0ZvcmNlRGlyZWN0ZWRTZXR0aW5ncyA9IHtcbiAgICBmb3JjZTogZm9yY2VTaW11bGF0aW9uPGFueT4oKS5mb3JjZSgnY2hhcmdlJywgZm9yY2VNYW55Qm9keSgpLnN0cmVuZ3RoKC0xNTApKS5mb3JjZSgnY29sbGlkZScsIGZvcmNlQ29sbGlkZSg1KSksXG4gICAgZm9yY2VMaW5rOiBmb3JjZUxpbms8YW55LCBhbnk+KClcbiAgICAgIC5pZChub2RlID0+IG5vZGUuaWQpXG4gICAgICAuZGlzdGFuY2UoKCkgPT4gMTAwKVxuICB9O1xuICBzZXR0aW5nczogRDNGb3JjZURpcmVjdGVkU2V0dGluZ3MgPSB7fTtcblxuICBpbnB1dEdyYXBoOiBHcmFwaDtcbiAgb3V0cHV0R3JhcGg6IEdyYXBoO1xuICBkM0dyYXBoOiBEM0dyYXBoO1xuICBvdXRwdXRHcmFwaCQ6IFN1YmplY3Q8R3JhcGg+ID0gbmV3IFN1YmplY3QoKTtcblxuICBkcmFnZ2luZ1N0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG5cbiAgcnVuKGdyYXBoOiBHcmFwaCk6IE9ic2VydmFibGU8R3JhcGg+IHtcbiAgICB0aGlzLmlucHV0R3JhcGggPSBncmFwaDtcbiAgICB0aGlzLmQzR3JhcGggPSB7XG4gICAgICBub2RlczogWy4uLnRoaXMuaW5wdXRHcmFwaC5ub2Rlcy5tYXAobiA9PiAoeyAuLi5uIH0pKV0gYXMgYW55LFxuICAgICAgZWRnZXM6IFsuLi50aGlzLmlucHV0R3JhcGguZWRnZXMubWFwKGUgPT4gKHsgLi4uZSB9KSldIGFzIGFueVxuICAgIH07XG4gICAgdGhpcy5vdXRwdXRHcmFwaCA9IHtcbiAgICAgIG5vZGVzOiBbXSxcbiAgICAgIGVkZ2VzOiBbXSxcbiAgICAgIGVkZ2VMYWJlbHM6IFtdXG4gICAgfTtcbiAgICB0aGlzLm91dHB1dEdyYXBoJC5uZXh0KHRoaXMub3V0cHV0R3JhcGgpO1xuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmRlZmF1bHRTZXR0aW5ncywgdGhpcy5zZXR0aW5ncyk7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuZm9yY2UpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MuZm9yY2VcbiAgICAgICAgLm5vZGVzKHRoaXMuZDNHcmFwaC5ub2RlcylcbiAgICAgICAgLmZvcmNlKCdsaW5rJywgdGhpcy5zZXR0aW5ncy5mb3JjZUxpbmsubGlua3ModGhpcy5kM0dyYXBoLmVkZ2VzKSlcbiAgICAgICAgLmFscGhhKDAuNSlcbiAgICAgICAgLnJlc3RhcnQoKVxuICAgICAgICAub24oJ3RpY2snLCAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5vdXRwdXRHcmFwaCQubmV4dCh0aGlzLmQzR3JhcGhUb091dHB1dEdyYXBoKHRoaXMuZDNHcmFwaCkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5vdXRwdXRHcmFwaCQuYXNPYnNlcnZhYmxlKCk7XG4gIH1cblxuICB1cGRhdGVFZGdlKGdyYXBoOiBHcmFwaCwgZWRnZTogRWRnZSk6IE9ic2VydmFibGU8R3JhcGg+IHtcbiAgICBjb25zdCBzZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZGVmYXVsdFNldHRpbmdzLCB0aGlzLnNldHRpbmdzKTtcbiAgICBpZiAoc2V0dGluZ3MuZm9yY2UpIHtcbiAgICAgIHNldHRpbmdzLmZvcmNlXG4gICAgICAgIC5ub2Rlcyh0aGlzLmQzR3JhcGgubm9kZXMpXG4gICAgICAgIC5mb3JjZSgnbGluaycsIHNldHRpbmdzLmZvcmNlTGluay5saW5rcyh0aGlzLmQzR3JhcGguZWRnZXMpKVxuICAgICAgICAuYWxwaGEoMC41KVxuICAgICAgICAucmVzdGFydCgpXG4gICAgICAgIC5vbigndGljaycsICgpID0+IHtcbiAgICAgICAgICB0aGlzLm91dHB1dEdyYXBoJC5uZXh0KHRoaXMuZDNHcmFwaFRvT3V0cHV0R3JhcGgodGhpcy5kM0dyYXBoKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLm91dHB1dEdyYXBoJC5hc09ic2VydmFibGUoKTtcbiAgfVxuXG4gIGQzR3JhcGhUb091dHB1dEdyYXBoKGQzR3JhcGg6IEQzR3JhcGgpOiBHcmFwaCB7XG4gICAgdGhpcy5vdXRwdXRHcmFwaC5ub2RlcyA9IHRoaXMuZDNHcmFwaC5ub2Rlcy5tYXAoKG5vZGU6IE1lcmdlZE5vZGUpID0+ICh7XG4gICAgICAuLi5ub2RlLFxuICAgICAgaWQ6IG5vZGUuaWQgfHwgaWQoKSxcbiAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgIHg6IG5vZGUueCxcbiAgICAgICAgeTogbm9kZS55XG4gICAgICB9LFxuICAgICAgZGltZW5zaW9uOiB7XG4gICAgICAgIHdpZHRoOiAobm9kZS5kaW1lbnNpb24gJiYgbm9kZS5kaW1lbnNpb24ud2lkdGgpIHx8IDIwLFxuICAgICAgICBoZWlnaHQ6IChub2RlLmRpbWVuc2lvbiAmJiBub2RlLmRpbWVuc2lvbi5oZWlnaHQpIHx8IDIwXG4gICAgICB9LFxuICAgICAgdHJhbnNmb3JtOiBgdHJhbnNsYXRlKCR7bm9kZS54IC0gKChub2RlLmRpbWVuc2lvbiAmJiBub2RlLmRpbWVuc2lvbi53aWR0aCkgfHwgMjApIC8gMiB8fCAwfSwgJHtcbiAgICAgICAgbm9kZS55IC0gKChub2RlLmRpbWVuc2lvbiAmJiBub2RlLmRpbWVuc2lvbi5oZWlnaHQpIHx8IDIwKSAvIDIgfHwgMFxuICAgICAgfSlgXG4gICAgfSkpO1xuXG4gICAgdGhpcy5vdXRwdXRHcmFwaC5lZGdlcyA9IHRoaXMuZDNHcmFwaC5lZGdlcy5tYXAoZWRnZSA9PiAoe1xuICAgICAgLi4uZWRnZSxcbiAgICAgIHNvdXJjZTogdG9EM05vZGUoZWRnZS5zb3VyY2UpLmlkLFxuICAgICAgdGFyZ2V0OiB0b0QzTm9kZShlZGdlLnRhcmdldCkuaWQsXG4gICAgICBwb2ludHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHg6IHRvRDNOb2RlKGVkZ2Uuc291cmNlKS54LFxuICAgICAgICAgIHk6IHRvRDNOb2RlKGVkZ2Uuc291cmNlKS55XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICB4OiB0b0QzTm9kZShlZGdlLnRhcmdldCkueCxcbiAgICAgICAgICB5OiB0b0QzTm9kZShlZGdlLnRhcmdldCkueVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgdGhpcy5vdXRwdXRHcmFwaC5lZGdlTGFiZWxzID0gdGhpcy5vdXRwdXRHcmFwaC5lZGdlcztcbiAgICByZXR1cm4gdGhpcy5vdXRwdXRHcmFwaDtcbiAgfVxuXG4gIG9uRHJhZ1N0YXJ0KGRyYWdnaW5nTm9kZTogTm9kZSwgJGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG4gICAgdGhpcy5zZXR0aW5ncy5mb3JjZS5hbHBoYVRhcmdldCgwLjMpLnJlc3RhcnQoKTtcbiAgICBjb25zdCBub2RlID0gdGhpcy5kM0dyYXBoLm5vZGVzLmZpbmQoZDNOb2RlID0+IGQzTm9kZS5pZCA9PT0gZHJhZ2dpbmdOb2RlLmlkKTtcbiAgICBpZiAoIW5vZGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5kcmFnZ2luZ1N0YXJ0ID0geyB4OiAkZXZlbnQueCAtIG5vZGUueCwgeTogJGV2ZW50LnkgLSBub2RlLnkgfTtcbiAgICBub2RlLmZ4ID0gJGV2ZW50LnggLSB0aGlzLmRyYWdnaW5nU3RhcnQueDtcbiAgICBub2RlLmZ5ID0gJGV2ZW50LnkgLSB0aGlzLmRyYWdnaW5nU3RhcnQueTtcbiAgfVxuXG4gIG9uRHJhZyhkcmFnZ2luZ05vZGU6IE5vZGUsICRldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xuICAgIGlmICghZHJhZ2dpbmdOb2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5vZGUgPSB0aGlzLmQzR3JhcGgubm9kZXMuZmluZChkM05vZGUgPT4gZDNOb2RlLmlkID09PSBkcmFnZ2luZ05vZGUuaWQpO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBub2RlLmZ4ID0gJGV2ZW50LnggLSB0aGlzLmRyYWdnaW5nU3RhcnQueDtcbiAgICBub2RlLmZ5ID0gJGV2ZW50LnkgLSB0aGlzLmRyYWdnaW5nU3RhcnQueTtcbiAgfVxuXG4gIG9uRHJhZ0VuZChkcmFnZ2luZ05vZGU6IE5vZGUsICRldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xuICAgIGlmICghZHJhZ2dpbmdOb2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5vZGUgPSB0aGlzLmQzR3JhcGgubm9kZXMuZmluZChkM05vZGUgPT4gZDNOb2RlLmlkID09PSBkcmFnZ2luZ05vZGUuaWQpO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3MuZm9yY2UuYWxwaGFUYXJnZXQoMCk7XG4gICAgbm9kZS5meCA9IHVuZGVmaW5lZDtcbiAgICBub2RlLmZ5ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iXX0=
