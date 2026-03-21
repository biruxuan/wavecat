# README

## About

This is the official Wails React-TS template.

You can configure the project by editing `wails.json`. More information about the project settings can be found
here: https://wails.io/docs/reference/project-config

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on http://localhost:34115. Connect
to this in your browser, and you can call your Go code from devtools.

## Building

To build a redistributable, production mode package, use `wails build`.


## 未解决的问题
### 拖拽Response分区时，send/connection 两个分区会鬼畜
#### 正确逻辑

1. 当send处于折叠状态，拖动response分割栏时，send保持折叠状态，response分区正常调整大小，顶着send实时收起connection直到其折叠。
2. 当send处于展开状态，拖动response分割栏时,先折叠send,当send折叠后需要加快速度或者松开鼠标(复用逻辑1)才能继续拖动
3. 若一直不松手，持续向上拖动至send和connection都折叠，此时向下拖动则response实时展开至折叠前大小，再实时展开send最低可致response折叠；如果其中任意一个在拖动前就已经处于折叠，则折叠谁就展开谁。