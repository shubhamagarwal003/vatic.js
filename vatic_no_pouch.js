"use strict";


function blobToImage(blob) {
  return new Promise((result, _) => {
    let img = new Image();
    img.onload = function() {
      result(img);
      URL.revokeObjectURL(this.src);
    };
    img.src = URL.createObjectURL(blob);
  });
}

class VideoPlayer {
  constructor(config, canvas, ctx){
    this.config = config;
    this.isReady = false;
    this.isPlaying = false;
    this.contextManager = new ContextManager(config);
    this.canvas = canvas;
    this.ctx = ctx;
    this.annotatedObjectsTracker = [];
    this.lastVideoDuration = 0;
    this.ratio = -1;
  }

  loadVideoFile(file){
    this.contextManager.reset();
    this.isReady = true;  // set it properly
    this.isPlaying = true; // set it properly
    this.lastVideoDuration = 0;
    this.annotatedObjectsTracker = null;
    this.contextManager.loadVideoFile(file);
    compatibility.requestAnimationFrame(this.onBrowserAnimation.bind(this));
  }

  setAnnotateObjectsTracker(annotatedObjectsTracker){
    this.annotatedObjectsTracker = annotatedObjectsTracker;
  }

  ready() {
    this.isReady = true;
  }

  seek(videoTime) {
    if(!this.isReady){
      return;
    }
    // this.pause();
    this.contextManager.seek(videoTime);
    this.lastVideoDuration = 0;
    // this.play();
  }

  play(){
    if(!this.isReady){
      return;
    }
    this.isPlaying = true;
    this.contextManager.play();
    //Play here
  }

  pause(){
    if (!this.isReady) {
      return;
    }
    // console.log("Pause video");
    this.contextManager.pause();
    this.isPlaying = false;
  }

  toogle() {
    if (!this.isPlaying) {
      this.play();
    } else {
      this.pause();
    }
  }

  getCurrentTime(){
    return this.contextManager.video.currentTime;
  }

  onBrowserAnimation(){
    if(this.contextManager && (this.contextManager.video.currentTime - this.lastVideoDuration) > 
      1/this.config.fps && this.isPlaying){
      this.lastVideoDuration = this.contextManager.video.currentTime;
      this.contextManager.pause();
      this.contextManager.extractCurrentFrame().then((img) => {
        annotatedObjectsTracker.getObjects(this.getCurrentTime()).then((objects) => {
          let hRatio = this.canvas.width / img.width;
          let vRatio = this.canvas.height / img.height;
          this.ratio  = Math.min ( hRatio, vRatio );
          for (let i = 0; i < objects.objects.length; i++) {
            let object = objects.objects[i];
            let annotatedObject = object.annotatedObject;
            let annotation = object.annotation;
            if (annotation.isVisible()) {
              let scaledBox = scaleBoxToCanvas(annotation.bbox, this.ratio);
              // console.log("Annotated Frame bbox", annotatedFrame.bbox);
              annotatedObject.dom.style.display = 'block';
              annotatedObject.dom.style.width = scaledBox.width + 'px';
              annotatedObject.dom.style.height = scaledBox.height + 'px';
              annotatedObject.dom.style.left = scaledBox.x + 'px';
              annotatedObject.dom.style.top = scaledBox.y + 'px';
              annotatedObject.visible.prop('checked', true);
            } else {
              annotatedObject.dom.style.display = 'none';
              annotatedObject.visible.prop('checked', false);
            }
          }
          this.ctx.drawImage(img, 0,0, img.width, img.height, 0,0,img.width*this.ratio, 
            img.height*this.ratio);
          if(this.isPlaying){
            this.contextManager.play();
          }
        });
      });
    }
    compatibility.requestAnimationFrame(this.onBrowserAnimation.bind(this));
  }
}

class ContextManager {
  constructor(config) {
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.config = config;
    this.images = [];
    this.videoTimes = [];
  }

// TODO reset all values
  loadVideoFile(file){
    this.video.autoplay = false;
    this.video.muted = true;
    this.video.loop = false;
    this.video.playbackRate = this.config.playbackRate;
    this.video.src = URL.createObjectURL(file);
    this.video.play();
    this.dimensionsInitialized = false;
    compatibility.requestAnimationFrame(this.onBrowserAnimationFrame.bind(this));
  }

  play(){
    this.video.play();
  }

  pause(){
    this.video.pause();
  }

  getFrame(videoTime){
    for(let i = this.images.length-1; i >= 0; i--){
      if(Math.abs(videoTime - this.images[i].videoTime) < 1/this.config.fps){
        return this.images[i].img;
      }
    }
    return null;
  }

  getPreviousTime(videoTime) {
    for(let i = this.videoTimes.length - 1; i>=0; i--){
      if(Math.abs(videoTime-this.videoTimes[i]) < 1/this.config.fps){
        if(i!=0){
          // console.log("Previous time: ", this.videoTimes[i-1], this.video.currentTime, videoTime, this.images);
          return this.videoTimes[i-1];
        }
      }
    }
    // console.log("Previous time: ", 0, this.video.currentTime, videoTime, this.images);
    return 0;
  }

  getNextTime(videoTime) {
    for(let i = 0; i < this.videoTimes.length ; i++){
      if(Math.abs(videoTime-this.videoTimes[i]) < 1/this.config.fps){
        if(i!=this.videoTimes.length-1){
          return this.videoTimes[i+1];
        }
      }
    }
    return this.video.currentTime;
  }

  seek(videoTime){
    if (this.video.readyState !== this.video.HAVE_CURRENT_DATA &&
        this.video.readyState !== this.video.HAVE_FUTURE_DATA &&
        this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
      return;
    }
    if(this.video.duration > videoTime){
      // seek change videoTimes array.
      if(videoTime < this.video.currentTime)
      {
        let i;
        for(i=0; i < this.videoTimes.length; i++){
          if(Math.abs(this.videoTimes[i] - videoTime) < 1/this.config.fps){
            break;
          }
        }
        if(i<this.videoTimes.length)
        {
          this.videoTimes.splice(i, this.videoTimes.length-i);
        }
      }
      this.video.currentTime = videoTime;
    }
  }

  extractCurrentFrame() {
    return new Promise((result, _) => {
      let flag = false;
      for(let i = this.images.length-1; i >= 0; i--){
        if(Math.abs(this.video.currentTime - this.images[i].videoTime) < 1/this.config.fps){
          result(this.images[i].img);
          flag = true;
        }
      }
      if(!flag){
        let videoTime = this.video.currentTime;
        let self = this;
        this.canvas.toBlob(function(blob){
          blobToImage(blob).then((img) => {
            if(self.images.length > self.config.maxImages){
              self.images.splice(0, self.images.length - self.config.maxImages);
            }
            // if(videoTime < self.video.currentTime){
              sortedPush(self.videoTimes, videoTime, 1/self.config.fps);
            // }
            self.images.push({img:img, videoTime: videoTime});
            result(img);
          });
        }, 'image/jpeg');
      }
    });
  }

  onBrowserAnimationFrame(){
    compatibility.requestAnimationFrame(this.onBrowserAnimationFrame.bind(this));
    if (this.video.readyState !== this.video.HAVE_CURRENT_DATA &&
        this.video.readyState !== this.video.HAVE_FUTURE_DATA &&
        this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
      return;
    }
    if (!this.dimensionsInitialized) {
      this.dimensionsInitialized = true;
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
    }
    this.ctx.drawImage(this.video, 0, 0); 
  }

  reset(){
    this.video.src = '';
  }
  // ctx.drawImage(video, 0, 0);
}

function scaleBoxToCanvas(bbox, ratio) {
  if(bbox)
  {
    return new BoundingBox(bbox.x*ratio, bbox.y*ratio, bbox.width*ratio, bbox.height*ratio);  
  }
  return bbox;
}

function sortedPush(array, value, epsilon){
  let i;
  for(i =0; i<array.length; i++){
    if(Math.abs(value - array[i]) < epsilon){
      break;
    }
  }
  if(i < array.length){
    array.splice(i, array.length-i);
  }
  array.push(value);
}


/**
 * Tracks point between two consecutive frames using optical flow.
 */
class OpticalFlow {
  constructor() {
    this.isInitialized = false;
    this.previousPyramid = new jsfeat.pyramid_t(3);
    this.currentPyramid = new jsfeat.pyramid_t(3);
  }

  init(imageData) {
    this.previousPyramid.allocate(imageData.width, imageData.height, jsfeat.U8_t | jsfeat.C1_t);
    this.currentPyramid.allocate(imageData.width, imageData.height, jsfeat.U8_t | jsfeat.C1_t);
    jsfeat.imgproc.grayscale(imageData.data, imageData.width, imageData.height, this.previousPyramid.data[0]);
    this.previousPyramid.build(this.previousPyramid.data[0]);
    this.isInitialized = true;
  }

  reset() {
    this.isInitialized = false;
  }

  track(imageData, bboxes) {
    if (!this.isInitialized) {
      throw 'not initialized';
    }
    jsfeat.imgproc.grayscale(imageData.data, imageData.width, imageData.height, this.currentPyramid.data[0]);
    this.currentPyramid.build(this.currentPyramid.data[0]);

    // TODO: Move all configuration to config
    let bboxBorderWidth = 1;

    let pointsPerDimension = 11;
    let pointsPerObject = pointsPerDimension * pointsPerDimension;
    let pointsCountUpperBound = bboxes.length * pointsPerObject;
    let pointsStatus = new Uint8Array(pointsCountUpperBound);
    let previousPoints = new Float32Array(pointsCountUpperBound * 2);
    let currentPoints = new Float32Array(pointsCountUpperBound * 2);

    let pointsCount = 0;
    for (let i = 0, n = 0; i < bboxes.length; i++) {
      let bbox = bboxes[i];
      if (bbox != null) {
        for (let x = 0; x < pointsPerDimension; x++) {
          for (let y = 0; y < pointsPerDimension; y++) {
            previousPoints[pointsCount*2] = bbox.x + x * (bbox.width / (pointsPerDimension - 1));
            previousPoints[pointsCount*2 + 1] = bbox.y + y * (bbox.height / (pointsPerDimension - 1));
            pointsCount++;
          }
        }
      }
    }
    if (pointsCount == 0) {
      throw 'no points to track';
    }

    jsfeat.optical_flow_lk.track(this.previousPyramid, this.currentPyramid, previousPoints, currentPoints, pointsCount, 30, 30, pointsStatus, 0.01, 0.001);

    let newBboxes = [];
    let p = 0;
    for (let i = 0; i < bboxes.length; i++) {
      let bbox = bboxes[i];
      let newBbox = null;

      if (bbox != null) {
        let before = [];
        let after = [];

        for (let j = 0; j < pointsPerObject; j++, p++) {
          if (pointsStatus[p] == 1) {
            let x = p * 2;
            let y = x + 1;

            before.push([previousPoints[x], previousPoints[y]]);
            after.push([currentPoints[x], currentPoints[y]]);
          }
        }

        if (before.length > 0) {
          let diff = nudged.estimate('T', before, after);
          let translation = diff.getTranslation();

          let minX = Math.max(Math.round(bbox.x + translation[0]), 0);
          let minY = Math.max(Math.round(bbox.y + translation[1]), 0);
          let maxX = Math.min(Math.round(bbox.x + bbox.width + translation[0]), imageData.width - 2*bboxBorderWidth);
          let maxY = Math.min(Math.round(bbox.y + bbox.height + translation[1]), imageData.height - 2*bboxBorderWidth);
          let newWidth = maxX - minX;
          let newHeight = maxY - minY;

          if (newWidth > 0 && newHeight > 0) {
            newBbox = new BoundingBox(minX, minY, newWidth, newHeight);
          }
        }
      }

      newBboxes.push(newBbox);
    }

    // Swap current and previous pyramids
    let oldPyramid = this.previousPyramid;
    this.previousPyramid = this.currentPyramid;
    this.currentPyramid = oldPyramid; // Buffer re-use

    return newBboxes;
  }
};

/**
 * Represents the coordinates of a bounding box
 */
class BoundingBox {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

/**
 * Represents a bounding box at a particular video currentTime.
 */
class Annotation {
  constructor(videoTime, bbox, isGroundTruth){
    this.videoTime = videoTime;
    this.bbox = bbox;
    this.isGroundTruth = isGroundTruth;
  }

  isVisible() {
    return this.bbox != null;
  }
}

class AnnotatedFrame {
  constructor(frameNumber, bbox, isGroundTruth) {
    this.frameNumber = frameNumber;
    this.bbox = bbox;
    this.isGroundTruth = isGroundTruth;
  }

  isVisible() {
    return this.bbox != null;
  }
}


/**
 * Represents an object bounding boxes throughout the entire video sequence.
 */
class AnnotatedObject {
  constructor(config) {
    this.annotations = [];
    this.config = config;
  }

  add(annotation) {
    for (let i = 0; i < this.annotations.length; i++) {
      if (Math.abs(this.annotations[i].videoTime - annotation.videoTime) < 1/this.config.fps) {
        this.annotations[i] = annotation;
        this.removeAnnotationToBeRecomputedFrom(i + 1);
        return;
      } else if (this.annotations[i].videoTime > annotation.videoTime) {
        this.annotations.splice(i, 0, annotation);
        this.removeAnnotationToBeRecomputedFrom(i + 1);
        this.injectInvisibleAnnotationAtOrigin();
        return;
      }
    }

    this.annotations.push(annotation);
    this.injectInvisibleAnnotationAtOrigin();
  }

  get(videoTime) {
    for (let i = 0; i < this.annotations.length; i++) {
      let currentAnnotation = this.annotations[i];

      if (Math.abs(currentAnnotation.videoTime - videoTime) < 1/this.config.fps) {
        return currentAnnotation;
      }

      if (currentAnnotation.videoTime > videoTime) {
        break;
      }

    }

    return null;
  }

  removeAnnotationToBeRecomputedFrom(index) {
    let count = 0;
    for (let i = index; i < this.annotations.length; i++) {
      if (this.annotations[i].isGroundTruth) {
        break;
      }
      count++;
    }
    if (count > 0) {
      this.annotations.splice(index, count);
    }
  }

  injectInvisibleAnnotationAtOrigin() {
    if (this.annotations.length == 0 || this.annotations[0].videoTime > 0) {
      this.annotations.splice(0, 0, new Annotation(0, null, false));
    }
  }
}



/**
 * Tracks annotated objects throughout a video using optical flow.
 */
class AnnotatedObjectsTracker {
  constructor(contextManager, config) {
    this.contextManager = contextManager;
    this.annotatedObjects = [];
    this.opticalFlow = new OpticalFlow();
    this.lastVideoTime = -1;
    this.ctx = document.createElement('canvas').getContext('2d');
    this.config = config;
    /*this.framesManager.onReset.push(() => {
      this.annotatedObjects = [];
      this.lastFrame = -1;
    });*/
  }

  getObjects(videoTime) {
    return new Promise((resolve, _) => {
      let time = this.startVideoTime(videoTime);
      if(time < 0){
        let result = [];
        for(let i=0; i < this.annotatedObjects.length; i++){
          let annotatedObject = this.annotatedObjects[i];
          let annotation = new Annotation(videoTime, null, false);
          annotatedObject.add(annotation);
          result.push({annotatedObject: annotatedObject, annotation: annotation});
          resolve({objects:[]});        
        }
      }
      let trackNextFrame = () => {
        this.track(time).then((frameWithObjects) => {
          if (Math.abs(time - videoTime) < 1/this.config.fps) {
            resolve(frameWithObjects);
          } else {
            // time += 1/this.config.fps;
            time = this.contextManager.getNextTime(time);
            trackNextFrame();
          }
        });
      };

      trackNextFrame();
    });
  }

  startVideoTime(videoTime) {
    for (; videoTime > 0; ) {
      let allObjectsHaveData = true;

      for (let i = 0; i < this.annotatedObjects.length; i++) {
        let annotatedObject = this.annotatedObjects[i];
        if (annotatedObject.get(videoTime) == null) {
          allObjectsHaveData = false;
          break;
        }
      }

      if (allObjectsHaveData) {
        return videoTime;
      }
      // videoTime = videoTime - 1/this.config.fps;
      videoTime = this.contextManager.getPreviousTime(videoTime);
    }

    return -1;
    // throw 'corrupted object annotations';
  }

  track(videoTime) {
    return new Promise((resolve, _) => {
      let result = [];
      let toCompute = [];
      for (let i = 0; i < this.annotatedObjects.length; i++) {
        let annotatedObject = this.annotatedObjects[i];
        let annotation = annotatedObject.get(videoTime);
        if (annotation == null) {
          // annotation = annotatedObject.get(videoTime - 1/this.config.fps);
          annotation = annotatedObject.get(this.contextManager.getPreviousTime(videoTime));
          if (annotation == null) {
            // console.log("tracking must be done sequentially");
            // throw 'tracking must be done sequentially';
            annotation = new Annotation(videoTime, null, false);
            annotatedObject.add(annotation);
            result.push({annotatedObject: annotatedObject, annotation: annotation});
            continue;
          }
          toCompute.push({annotatedObject: annotatedObject, bbox: annotation.bbox});
        } else {
          result.push({annotatedObject: annotatedObject, annotation: annotation});
        }
      }
      if(toCompute.length > 0){
        let img = this.contextManager.getFrame(videoTime);
        if(img == null){
          console.log("Image is null 1");
          resolve({objects: result});
        }
        else{
          let bboxes = toCompute.map(c => c.bbox);
          let hasAnyBbox = bboxes.some(bbox => bbox != null);
          let optionalOpticalFlowInit;
          if (hasAnyBbox) {
            optionalOpticalFlowInit = this.initOpticalFlow(videoTime);
          } else {
            optionalOpticalFlowInit = new Promise((r, _) => { r(); });
          }

          optionalOpticalFlowInit.then(() => {
            let newBboxes;
            if (hasAnyBbox) {
              let imageData = this.imageData(img);
              newBboxes = this.opticalFlow.track(imageData, bboxes);
              this.lastVideoTime = videoTime;
            } else {
              newBboxes = bboxes;
            }

            for (let i = 0; i < toCompute.length; i++) {
              let annotatedObject = toCompute[i].annotatedObject;
              let annotation = new Annotation(videoTime, newBboxes[i], false);
              annotatedObject.add(annotation);
              result.push({annotatedObject: annotatedObject, annotation: annotation});
            }
            resolve({objects: result})
          });   
        };
      }
      else{
        resolve({objects: result});
      }
    });
  }

  initOpticalFlow(videoTime) {
    return new Promise((resolve, _) => {
      // videoTime = videoTime - 1/this.config.fps;
      videoTime = this.contextManager.getPreviousTime(videoTime);
      if (this.lastVideoTime != -1 && Math.abs(this.lastVideoTime-videoTime) < 1/this.config.fps) {
        resolve();
      } else {
        this.opticalFlow.reset();
        let img = this.contextManager.getFrame(videoTime)
        if(img == null){
          console.log("Image is null 2");
        }
        else{
          let imageData = this.imageData(img);
          this.opticalFlow.init(imageData);
          this.lastVideoTime = videoTime;
          resolve();
        }
      }
    });
  }

  imageData(img) {
    let canvas = this.ctx.canvas;
    canvas.width = img.width;
    canvas.height = img.height;
    this.ctx.drawImage(img, 0, 0);
    return this.ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
};