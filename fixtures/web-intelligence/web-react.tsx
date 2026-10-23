import { useState } from "react";
const [count, setCount] = useState(0);
setCount("wrong");
function Card(props: { title: string }) { return <div>{props.title}</div>; }
const card = <Card ti />;
