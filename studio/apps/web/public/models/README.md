# Local face detector

`blaze-face-short-range.tflite` is the unmodified Google MediaPipe BlazeFace short-range float16 v1 model.

Source: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

Documentation and model card: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector

The model and the `@mediapipe/tasks-vision` WASM runtime are served locally. The application does not contact a CDN for detection. Generated WASM copies in `public/mediapipe` come from the installed package at dev/build time and are not source assets.
