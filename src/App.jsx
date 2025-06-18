import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import Navbar from "./components/Navbar";
import Manager from "./components/Manager";
import Footer from "./components/Footer";

function App() {

  return (
    <>
      <Navbar />
      <div className="fixed left-0 top-0 -z-10 h-full w-full">
        <div className="absolute inset-0 top-16 -z-10 h-full  w-full bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem]"></div>
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[radial-gradient(circle_1200px_at_80%_200px,#d5c5ff,transparent)]"></div>
      </div>
      <Manager />
      <Footer />
    </>
  );
}

export default App;
