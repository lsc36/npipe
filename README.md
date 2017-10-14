# npipe

Send files by piping into `nc`.

```
user@server:~/npipe$ npm start

user@host1:~$ (echo new; cat file) | nc server 25252
ke5xFd

user@host2:~$ echo ke5xFd | nc server 25252 > file
```

## TODO

- Fix occasional OOM (doesn't look like memleak, even when buffer is small & only 1 client)

## License

MIT
