'use strict';

const net = require('net');
const randomstring = require('randomstring');

const server = net.createServer(onServerConnection);
server.listen(process.env.PORT || 25252);

const metadataMap = new WeakMap;
const idMap = {};

function onServerConnection(socket) {
    metadataMap[socket] = {
        previous: Buffer.alloc(0)
    };
    socket.on('data', onNewSocketData).on('error', onSocketError);
}

function onNewSocketData(data) {
    const metadata = metadataMap[this];
    data = Buffer.concat([metadata.previous, data]);
    const linebreak = data.indexOf(0xa);

    if (linebreak != -1) {
        this.removeListener('data', onNewSocketData);

        const id = data.toString('ascii', 0, linebreak);
        if (id === 'new') {
            // sender
            let newId;
            do {
                newId = randomstring.generate(6);
            } while (newId in idMap);
            metadata.id = newId;
            metadata.sender = this;
            metadata.previous = data.slice(linebreak + 1);
            idMap[newId] = metadata;
            this.write(newId + '\n');
            this.pause();
            this.on('data', onSenderSocketData);
            this.on('close', onSenderSocketClose);
        } else {
            // receiver
            if (!idMap[id] || idMap[id].receiver) {
                this.destroy();
                return;
            }
            const {sender, previous} = metadataMap[this] = idMap[id];
            idMap[id].receiver = this;
            if (previous.length > 0) {
                this.write(previous);
            }
            sender.resume();
            this.on('close', onReceiverSocketClose);
            this.on('error', (err) => {});
        }
    } else {
        if (data.length > 64) {
            this.destroy();
            return;
        }
        metadata.previous = data;
    }
}

function onSenderSocketData(data) {
    const {receiver} = metadataMap[this];
    if (!receiver.writable) {
        return;
    }
    receiver.write(data);
    if (receiver.bufferSize >= 1024 * 1024) {
        this.pause();
        const onDrain = () => {
            this.resume();
            receiver.removeListener('drain', onDrain);
        };
        receiver.on('drain', onDrain);
    }
}

function onSenderSocketClose() {
    const metadata = metadataMap[this];
    const {id, receiver, finished} = metadata;
    if (finished) {
        return;
    }
    if (receiver) {
        receiver.removeListener('close', onReceiverSocketClose);
        receiver.end();
    }
    delete idMap[id];
    metadata.finished = true;
}

function onReceiverSocketClose() {
    const metadata = metadataMap[this];
    const {id, sender, finished} = metadata;
    if (finished) {
        return;
    }
    sender.removeListener('close', onSenderSocketClose);
    sender.end();
    delete idMap[id];
    metadata.finished = true;
}

function onSocketError(err) {
    if (!(err.syscall === 'read' && err.errno === 'ECONNRESET' ||
          err.syscall === 'write' && err.errno === 'EPIPE')) {
        console.log('Unknown error: ' + err);
    }
}
