const uuid = require('uuid');

const ROOMS = [];

const SocketGame = (io, {
  onConnection = (f) => f,
  onRoomStart = (f) => f,
  onUserCreate = (f) => f,
  maxUser = 4,
  minUser = 1,
} = {}) => {
  io.on('connection', (socket) => {
    onConnection(socket);

    const userId = uuid.v4();
    let currentRoomId;

    socket.emit('id', userId);

    const isRoomOwner = () => userId === currentRoomId;

    const makeUser = (userData) => ({ id: userId, socket, ...onUserCreate(userData) });

    const getUsers = () => ROOMS[currentRoomId].map(({ socket: _, ...user }) => user);

    const emitAllRoom = (event, args) => io.in(currentRoomId).emit(event, args);

    const sendRoomUsers = () => emitAllRoom('roomUserState', getUsers());

    const checkRoom = (roomId) => {
      const room = ROOMS[roomId];
      if (!room) {
        socket.emit('scene', 'NOT_EXISTS_ROOM');
      } else if (room.length >= maxUser) {
        socket.emit('scene', 'FULL_ROOM');
      } else {
        return true;
      }
      return false;
    };

    socket.on('roomCreate', (user) => {
      currentRoomId = userId;
      ROOMS[currentRoomId] = [makeUser(user)];
      socket.emit('roomCreated', currentRoomId);
      socket.join(currentRoomId);
      sendRoomUsers();
    });

    socket.on('roomCheck', checkRoom);

    socket.on('roomJoin', (roomId, user) => {
      currentRoomId = roomId;
      if (checkRoom(currentRoomId)) {
        ROOMS[currentRoomId].push(makeUser(user));
        socket.join(currentRoomId);
        sendRoomUsers();
      }
    });

    socket.on('roomKick', (kickedUserId) => {
      const room = ROOMS[currentRoomId];
      const user = room && room.find((u) => u.id === kickedUserId);
      if (user) {
        user.socket.emit('scene', 'KICKED_ROOM');
        user.socket.leave(currentRoomId);
        ROOMS[currentRoomId] = room.filter((u) => u.id !== kickedUserId);
        sendRoomUsers();
      }
    });

    socket.on('roomStart', () => {
      const room = ROOMS[currentRoomId];
      if (isRoomOwner() && room.length >= minUser) {
        emitAllRoom('scene', 'GAME');
        onRoomStart(room);
      }
    });

    const disconnect = () => {
      if (!ROOMS[currentRoomId]) return;
      ROOMS[currentRoomId] = ROOMS[currentRoomId].filter((p) => p.id !== userId);
      if (isRoomOwner() || ROOMS[currentRoomId].length === 0) {
        socket.to(currentRoomId).emit('scene', 'NOT_EXISTS_ROOM');
        delete ROOMS[currentRoomId];
      } else {
        sendRoomUsers(currentRoomId);
      }

      socket.leave(currentRoomId);
    };

    socket.on('roomLeave', disconnect);

    socket.on('disconnect', disconnect);
  });
};

module.exports = SocketGame;
