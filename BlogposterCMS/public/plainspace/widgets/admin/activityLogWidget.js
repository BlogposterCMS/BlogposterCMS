// public//plainspace/widgets/admin/activityLogWidget.js
export function render(el){
    const ul=document.createElement('ul');
    ['login','view','logout'].forEach(a=>{
      const li=document.createElement('li');
      li.textContent=`Activity: ${a} at ${new Date().toLocaleTimeString()}`;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }
  