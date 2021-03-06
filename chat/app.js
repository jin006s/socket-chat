const express = require('express');
const app = express();

//设置静态文件夹,会默认找当前目录下的index.html文件当做访问的页面
app.use(express.static(__dirname));

//WebSocket是依赖HTTP协议进行握手的
const server = require('http').createServer(app);
const io = require('socket.io')(server);

// 把系统设置为常量，方便使用
const SYSTEM = '系统';

// 用来保存对应的socket，就是记录对方的socket实例
let socketObj = {};

// 设置一些颜色的数组，让每次进入聊天的用户颜色都不一样
let userColor = [
  '#00a1f4',
  '#0cc',
  '#f44336',
  '#795548',
  '#e91e63',
  '#00bcd4',
  '#009688',
  '#4caf50',
  '#8bc34a',
  '#ffc107',
  '#607d8b',
  '#ff9800',
  '#ff5722'
];

// 乱序排列方法，方便把数组打乱
function shuffle(arr) {
  let len = arr.length,
    random;
  while (0 !== len) {
    //右移运算符向下取整
    random = (Math.random() * len--) >>> 0;
    // 解构赋值实现变量互换
    [arr[len], arr[random]] = [arr[random], arr[len]];
  }
  return arr;
}

// 上来记录一个socket.id用来查找对应的用户
let mySocket = {};

// 创建一个数组用来保存最近的20条消息记录，真实项目中会存到数据库中
let msgHistory = [];

//监听与客户端的连接事件
io.on('connection', socket => {
  console.log('服务端连接成功!');
  // 记录用户名，用来记录是不是第一次进入，默认是undefined
  let username;

  let color; // 用于存颜色的变量

  // 记录进入了哪些房间的数组
  let rooms = [];

  // 这是所有连接到服务端的socket.id
  mySocket[socket.id] = socket;

  // 服务端发送message事件，把msg消息再发送给客户端
  socket.on('message', msg => {
    if (username) {
      //正则判断消息是否为私聊专属
      let private = msg.match(/@([^ ]+) (.+)/);
      if (private) {
        //私聊信息
        // 私聊的用户，正则匹配的第一个分组
        let toUser = private[1];
        // 私聊的内容，正则匹配的第二个分组
        let content = private[2];
        // 从socketObj中获取私聊用户的socket
        let toSocket = socketObj[toUser];
        console.log('到此一游!', socketObj);
        console.log('到此二游!', socketObj[toUser]);
        if (toSocket) {
          //向私聊的用户发送信息
          toSocket.send({
            user: username,
            color,
            content,
            createAt: new Date().toLocaleString()
          });
        }
      } else {
        // 如果rooms数组有值，就代表有用户进入了房间
        if (rooms.length) {
          //用来存储进入房间内对应的socket.id
          let socketJson = {};
          rooms.forEach(room => {
            // 取得进入房间内所对应的所有sockets的hash值，它便是拿到的socket.id
            let roomSockets = io.sockets.adapter.rooms[room].sockets;
            Object.keys(roomSockets).forEach(socketId => {
              console.log('socketId', socketId);
              // 进行一个去重，在socketJson中只有对应唯一的socketId
              if (!socketJson[socketId]) {
                socketJson[socketId] = 1;
              }
            });
          });

          // 遍历socketJson，在mySocket里找到对应的id，然后发送消息
          Object.keys(socketJson).forEach(socketId => {
            mySocket[socketId].emit('message', {
              user: username,
              color,
              content: msg,
              createAt: new Date().toLocaleString()
            });
          });
        } else {
          // 如果不是私聊的，向所有人广播
          io.emit('message', {
            user: username,
            color,
            content: msg,
            createAt: new Date().toLocaleString()
          });
          msgHistory.push({
            user: username,
            color,
            content: msg,
            createAt: new Date().toLocaleString()
          });
        }
      }
    } else {
      // 用户名不存在的情况
      // 如果是第一次进入的话，就将输入的内容当做用户名
      username = msg;

      //乱序后取出颜色数组的第一个,分配给进入的用户
      color = shuffle(userColor)[0];

      // 向除了自己的所有人广播，毕竟进没进入自己是知道的，没必要跟自己再说一遍
      // ☆️ socket.broadcast.emit，这个方法是向除了自己外的所有人广播
      socket.broadcast.emit('message', {
        user: SYSTEM,
        color,
        content: `${username}加入了聊天!`,
        createAt: new Date().toLocaleString()
      });
      // 把socketObj对象上对应的用户名赋为一个socket
      // 如： socketObj = { '周杰伦': socket, '谢霆锋': socket }
      //保存每个用户的socket
      socketObj[username] = socket;
    }
  });

  // 监听进入房间的事件
  socket.on('join', room => {
    // 判断一下用户是否进入了房间，如果没有就让其进入房间内
    if (username && rooms.indexOf(room) === -1) {
      //socket.join表示进入了某个房间
      socket.join(room);
      rooms.push(room);
      // 这里发送个joined事件，让前端监听后，控制房间按钮显隐
      socket.emit('joined', room);
      // 通知一下自己
      socket.send({
        user: SYSTEM,
        color,
        content: `你已加入${room}战队`,
        createAt: new Date().toLocaleString()
      });
    }
  });

  // 监听离开房间的事件
  socket.on('leave', room => {
    //index为房间在数组rooms中的索引,方便删除
    let index = rooms.indexOf(room);
    if (index !== -1) {
      //离开该房间
      socket.leave(room);
      rooms.splice(index, 1); // 删掉该房间
      // 这里发送个leaved事件，让前端监听后，控制房间按钮显隐
      socket.emit('leaved', room);
      // 通知一下自己
      socket.send({
        user: SYSTEM,
        color,
        content: `你已离开${room}战队`,
        createAt: new Date().toLocaleString()
      });
    }
  });

  // 监听获取历史消息的事件
  socket.on('getHistory', () => {
    // 通过数组的slice方法截取最新的20条消息
    if (msgHistory.length) {
      let history = msgHistory.slice(msgHistory.length - 20);
      // 发送history事件并返回history消息数组给客户端
      socket.emit('history', history);
    }
  });
});

// ☆ 这里要用server去监听端口，而非app.listen去监听(不然找不到socket.io.js文件)
server.listen(4000, () => {
  console.log('连接到端口4000');
});
