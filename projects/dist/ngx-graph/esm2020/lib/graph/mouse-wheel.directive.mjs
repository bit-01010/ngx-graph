import { Directive, Output, HostListener, EventEmitter } from '@angular/core';
import * as i0 from '@angular/core';
/**
 * Mousewheel directive
 * https://github.com/SodhanaLibrary/angular2-examples/blob/master/app/mouseWheelDirective/mousewheel.directive.ts
 *
 * @export
 */
// tslint:disable-next-line: directive-selector
export class MouseWheelDirective {
  constructor() {
    this.mouseWheelUp = new EventEmitter();
    this.mouseWheelDown = new EventEmitter();
  }
  onMouseWheelChrome(event) {
    this.mouseWheelFunc(event);
  }
  onMouseWheelFirefox(event) {
    this.mouseWheelFunc(event);
  }
  onWheel(event) {
    this.mouseWheelFunc(event);
  }
  onMouseWheelIE(event) {
    this.mouseWheelFunc(event);
  }
  mouseWheelFunc(event) {
    if (window.event) {
      event = window.event;
    }
    const delta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail || event.deltaY || event.deltaX));
    // Firefox don't have native support for wheel event, as a result delta values are reverse
    const isWheelMouseUp = event.wheelDelta ? delta > 0 : delta < 0;
    const isWheelMouseDown = event.wheelDelta ? delta < 0 : delta > 0;
    if (isWheelMouseUp) {
      this.mouseWheelUp.emit(event);
    } else if (isWheelMouseDown) {
      this.mouseWheelDown.emit(event);
    }
    // for IE
    event.returnValue = false;
    // for Chrome and Firefox
    if (event.preventDefault) {
      event.preventDefault();
    }
  }
}
MouseWheelDirective.ɵfac = i0.ɵɵngDeclareFactory({
  minVersion: '12.0.0',
  version: '13.3.11',
  ngImport: i0,
  type: MouseWheelDirective,
  deps: [],
  target: i0.ɵɵFactoryTarget.Directive
});
MouseWheelDirective.ɵdir = i0.ɵɵngDeclareDirective({
  minVersion: '12.0.0',
  version: '13.3.11',
  type: MouseWheelDirective,
  selector: '[mouseWheel]',
  outputs: { mouseWheelUp: 'mouseWheelUp', mouseWheelDown: 'mouseWheelDown' },
  host: {
    listeners: {
      mousewheel: 'onMouseWheelChrome($event)',
      DOMMouseScroll: 'onMouseWheelFirefox($event)',
      wheel: 'onWheel($event)',
      onmousewheel: 'onMouseWheelIE($event)'
    }
  },
  ngImport: i0
});
i0.ɵɵngDeclareClassMetadata({
  minVersion: '12.0.0',
  version: '13.3.11',
  ngImport: i0,
  type: MouseWheelDirective,
  decorators: [
    {
      type: Directive,
      args: [{ selector: '[mouseWheel]' }]
    }
  ],
  propDecorators: {
    mouseWheelUp: [
      {
        type: Output
      }
    ],
    mouseWheelDown: [
      {
        type: Output
      }
    ],
    onMouseWheelChrome: [
      {
        type: HostListener,
        args: ['mousewheel', ['$event']]
      }
    ],
    onMouseWheelFirefox: [
      {
        type: HostListener,
        args: ['DOMMouseScroll', ['$event']]
      }
    ],
    onWheel: [
      {
        type: HostListener,
        args: ['wheel', ['$event']]
      }
    ],
    onMouseWheelIE: [
      {
        type: HostListener,
        args: ['onmousewheel', ['$event']]
      }
    ]
  }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW91c2Utd2hlZWwuZGlyZWN0aXZlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3dpbWxhbmUvbmd4LWdyYXBoL3NyYy9saWIvZ3JhcGgvbW91c2Utd2hlZWwuZGlyZWN0aXZlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSxlQUFlLENBQUM7O0FBRTlFOzs7OztHQUtHO0FBQ0gsK0NBQStDO0FBRS9DLE1BQU0sT0FBTyxtQkFBbUI7SUFEaEM7UUFHRSxpQkFBWSxHQUFHLElBQUksWUFBWSxFQUFFLENBQUM7UUFFbEMsbUJBQWMsR0FBRyxJQUFJLFlBQVksRUFBRSxDQUFDO0tBNkNyQztJQTFDQyxrQkFBa0IsQ0FBQyxLQUFVO1FBQzNCLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUdELG1CQUFtQixDQUFDLEtBQVU7UUFDNUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBR0QsT0FBTyxDQUFDLEtBQVU7UUFDaEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBR0QsY0FBYyxDQUFDLEtBQVU7UUFDdkIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBRUQsY0FBYyxDQUFDLEtBQVU7UUFDdkIsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFO1lBQ2hCLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO1NBQ3RCO1FBRUQsTUFBTSxLQUFLLEdBQVcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsVUFBVSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ25ILDBGQUEwRjtRQUMxRixNQUFNLGNBQWMsR0FBWSxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sZ0JBQWdCLEdBQVksS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUMzRSxJQUFJLGNBQWMsRUFBRTtZQUNsQixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUMvQjthQUFNLElBQUksZ0JBQWdCLEVBQUU7WUFDM0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDakM7UUFFRCxTQUFTO1FBQ1QsS0FBSyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFFMUIseUJBQXlCO1FBQ3pCLElBQUksS0FBSyxDQUFDLGNBQWMsRUFBRTtZQUN4QixLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7U0FDeEI7SUFDSCxDQUFDOztpSEFoRFUsbUJBQW1CO3FHQUFuQixtQkFBbUI7NEZBQW5CLG1CQUFtQjtrQkFEL0IsU0FBUzttQkFBQyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUU7OEJBR3JDLFlBQVk7c0JBRFgsTUFBTTtnQkFHUCxjQUFjO3NCQURiLE1BQU07Z0JBSVAsa0JBQWtCO3NCQURqQixZQUFZO3VCQUFDLFlBQVksRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkFNdEMsbUJBQW1CO3NCQURsQixZQUFZO3VCQUFDLGdCQUFnQixFQUFFLENBQUMsUUFBUSxDQUFDO2dCQU0xQyxPQUFPO3NCQUROLFlBQVk7dUJBQUMsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDO2dCQU1qQyxjQUFjO3NCQURiLFlBQVk7dUJBQUMsY0FBYyxFQUFFLENBQUMsUUFBUSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGlyZWN0aXZlLCBPdXRwdXQsIEhvc3RMaXN0ZW5lciwgRXZlbnRFbWl0dGVyIH0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5cbi8qKlxuICogTW91c2V3aGVlbCBkaXJlY3RpdmVcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9Tb2RoYW5hTGlicmFyeS9hbmd1bGFyMi1leGFtcGxlcy9ibG9iL21hc3Rlci9hcHAvbW91c2VXaGVlbERpcmVjdGl2ZS9tb3VzZXdoZWVsLmRpcmVjdGl2ZS50c1xuICpcbiAqIEBleHBvcnRcbiAqL1xuLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBkaXJlY3RpdmUtc2VsZWN0b3JcbkBEaXJlY3RpdmUoeyBzZWxlY3RvcjogJ1ttb3VzZVdoZWVsXScgfSlcbmV4cG9ydCBjbGFzcyBNb3VzZVdoZWVsRGlyZWN0aXZlIHtcbiAgQE91dHB1dCgpXG4gIG1vdXNlV2hlZWxVcCA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgQE91dHB1dCgpXG4gIG1vdXNlV2hlZWxEb3duID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuXG4gIEBIb3N0TGlzdGVuZXIoJ21vdXNld2hlZWwnLCBbJyRldmVudCddKVxuICBvbk1vdXNlV2hlZWxDaHJvbWUoZXZlbnQ6IGFueSk6IHZvaWQge1xuICAgIHRoaXMubW91c2VXaGVlbEZ1bmMoZXZlbnQpO1xuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignRE9NTW91c2VTY3JvbGwnLCBbJyRldmVudCddKVxuICBvbk1vdXNlV2hlZWxGaXJlZm94KGV2ZW50OiBhbnkpOiB2b2lkIHtcbiAgICB0aGlzLm1vdXNlV2hlZWxGdW5jKGV2ZW50KTtcbiAgfVxuXG4gIEBIb3N0TGlzdGVuZXIoJ3doZWVsJywgWyckZXZlbnQnXSlcbiAgb25XaGVlbChldmVudDogYW55KTogdm9pZCB7XG4gICAgdGhpcy5tb3VzZVdoZWVsRnVuYyhldmVudCk7XG4gIH1cblxuICBASG9zdExpc3RlbmVyKCdvbm1vdXNld2hlZWwnLCBbJyRldmVudCddKVxuICBvbk1vdXNlV2hlZWxJRShldmVudDogYW55KTogdm9pZCB7XG4gICAgdGhpcy5tb3VzZVdoZWVsRnVuYyhldmVudCk7XG4gIH1cblxuICBtb3VzZVdoZWVsRnVuYyhldmVudDogYW55KTogdm9pZCB7XG4gICAgaWYgKHdpbmRvdy5ldmVudCkge1xuICAgICAgZXZlbnQgPSB3aW5kb3cuZXZlbnQ7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsdGE6IG51bWJlciA9IE1hdGgubWF4KC0xLCBNYXRoLm1pbigxLCBldmVudC53aGVlbERlbHRhIHx8IC1ldmVudC5kZXRhaWwgfHwgZXZlbnQuZGVsdGFZIHx8IGV2ZW50LmRlbHRhWCkpO1xuICAgIC8vIEZpcmVmb3ggZG9uJ3QgaGF2ZSBuYXRpdmUgc3VwcG9ydCBmb3Igd2hlZWwgZXZlbnQsIGFzIGEgcmVzdWx0IGRlbHRhIHZhbHVlcyBhcmUgcmV2ZXJzZVxuICAgIGNvbnN0IGlzV2hlZWxNb3VzZVVwOiBib29sZWFuID0gZXZlbnQud2hlZWxEZWx0YSA/IGRlbHRhID4gMCA6IGRlbHRhIDwgMDtcbiAgICBjb25zdCBpc1doZWVsTW91c2VEb3duOiBib29sZWFuID0gZXZlbnQud2hlZWxEZWx0YSA/IGRlbHRhIDwgMCA6IGRlbHRhID4gMDtcbiAgICBpZiAoaXNXaGVlbE1vdXNlVXApIHtcbiAgICAgIHRoaXMubW91c2VXaGVlbFVwLmVtaXQoZXZlbnQpO1xuICAgIH0gZWxzZSBpZiAoaXNXaGVlbE1vdXNlRG93bikge1xuICAgICAgdGhpcy5tb3VzZVdoZWVsRG93bi5lbWl0KGV2ZW50KTtcbiAgICB9XG5cbiAgICAvLyBmb3IgSUVcbiAgICBldmVudC5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xuXG4gICAgLy8gZm9yIENocm9tZSBhbmQgRmlyZWZveFxuICAgIGlmIChldmVudC5wcmV2ZW50RGVmYXVsdCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==
