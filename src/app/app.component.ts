import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { concat, switchMap, Observable, take, tap, of, delay, map } from 'rxjs';
import { RecordCanvasService } from './record-canvas.service';
import { ChromeExtensionService } from './chrome-extension.service';
import {
  Extension,
  IRecordInput,
  IRecorderConfig,
  CaptureType,
  ICaptureConfig,
  IDevice,
} from './app.types';
import { devices } from './devices';

const delayResize: number = 300;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  @ViewChild('canvasElement', { static: true })
  canvas!: ElementRef<HTMLCanvasElement>;

  private readonly extension: Extension = Extension.PNG;

  constructor(
    private readonly recordCanvas: RecordCanvasService,
    private readonly chromeExtension: ChromeExtensionService
  ) { }

  ngOnInit(): void {
    this.chromeExtension.init(this.extension);
  }

  generateRecord(config: IRecorderConfig) {
    const captureConfig: ICaptureConfig = {
      type: CaptureType.RECORD,
      scaleFactor: config.scaleFactor,
      offset: config.offset,
      fps: config.fps,
    };

    this.generate(captureConfig);
  }

  async generate(captureConfig: ICaptureConfig) {
    const obs$: Observable<any>[] = [];

    let originalDevice: IDevice;

    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      device.deviceScaleFactor = captureConfig.scaleFactor;

      obs$.push(
        this.chromeExtension.hideScrollbars().pipe(
          tap(() => console.log('current turn: ', device.id)),
          switchMap(() => this.chromeExtension.getViewportSize()),
          switchMap((viewportSize: any) => {
            originalDevice = {
              id: '',
              width: viewportSize.clientWidth,
              height: viewportSize.clientHeight,
              deviceScaleFactor: 1,
              mobile: device.mobile,
            };

            const resizeToFullScreen =
              captureConfig.type === CaptureType.FULLSIZE_SCREENSHOT ||
              captureConfig.type === CaptureType.FRAMES ||
              captureConfig.type === CaptureType.RECORD;

            return this.chromeExtension
              .resizeWrapper(device, resizeToFullScreen)
              .pipe(delay(delayResize));
          }),
          switchMap(() => this.chromeExtension.screenshot()),
          switchMap((base64: string) =>
            this.chromeExtension.resize(originalDevice).pipe(map(() => base64))
          ),
          switchMap((base64: string) => {
            const toCrop =
              captureConfig.type === CaptureType.RECORD ||
              captureConfig.type === CaptureType.FRAMES;

            if (toCrop)
              return this.chromeExtension.cropWrapper(
                base64,
                device,
                captureConfig.offset
              );

            return of([base64]);
          }),
          switchMap((frames: string[]) => {
            if (captureConfig.type === CaptureType.RECORD) {
              const config: IRecordInput = {
                canvas: this.canvas.nativeElement,
                frames: frames,
                device,
                fps: captureConfig.fps ?? 10,
              };

              return this.recordCanvas.init(config);
            }

            return this.chromeExtension.downloadWrapper(frames, device);
          }),
          take(1)
        )
      );
    }

    concat(...obs$).subscribe();
  }
}
